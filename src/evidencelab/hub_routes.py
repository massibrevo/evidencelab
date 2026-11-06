"""Local chat, agent teams, action approvals, and experiment jobs."""

import json
import logging
import os
import sqlite3
import subprocess
import sys
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock, Thread
from time import time
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import Field, TypeAdapter

from . import hub_actions as actions
from . import hub_experiments as experiments
from .hub_models import LANGUAGES, ChatInput, Input, Language, LocalModels, ModelRef
from .models import MODEL_IDS
from .runtime_security import local_runtime_env
from .service import ROOT, Lab

router = APIRouter(prefix="/api/hub")
log = logging.getLogger(__name__)
action_adapter = TypeAdapter(actions.Action)
PRESETS = {
    "atlas": ("Atlas", "Break the task into concrete steps. Identify constraints and an approach."),
    "pixel": ("Pixel", "Develop a practical solution. Give examples or pseudocode when useful."),
    "sentinel": (
        "Sentinel",
        "Review the proposed solution. Identify incorrect assumptions and missing checks.",
    ),
    "relay": ("Relay", "Synthesize the preceding work into a direct response to the original task."),
}


class Agent(Input):
    name: str = Field(min_length=1, max_length=60)
    instructions: str = Field(min_length=1, max_length=3000)


class TeamRun(Input):
    model: ModelRef
    agent_ids: list[str] = Field(min_length=1, max_length=5)
    task: str = Field(min_length=1, max_length=8000)
    language: Language = "en"


class Draft(Input):
    model: ModelRef
    task: str = Field(min_length=1, max_length=8000)
    language: Language = "en"


class Approval(Input):
    approve: bool


class Train(Input):
    dataset: str = Field(pattern=r"^[a-f0-9]{64}$")
    model: Literal["qwen-0.8b", "qwen-4b"] = "qwen-0.8b"
    revision: str = Field(default="main", pattern=r"^[A-Za-z0-9_./-]{1,100}$")
    max_steps: int = Field(default=10, ge=1, le=1000)
    rank: int = Field(default=8, ge=1, le=64)
    quantization: Literal["none", "nf4"] = "none"


class Hub:
    def __init__(self, lab: Lab):
        self.root = lab.home.resolve()
        self.models = LocalModels(self.root, lab.lock)
        self.datasets = self.root / "datasets"
        self.db = self.root / "hub.sqlite3"
        self.jobs = Lock()
        self.dataset_lock = Lock()
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS records "
                "(id TEXT PRIMARY KEY, kind TEXT, status TEXT, created REAL, payload TEXT)"
            )

    def record(self, kind: str, status: str, payload: dict) -> str:
        key = uuid4().hex
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "INSERT INTO records VALUES (?, ?, ?, ?, ?)", (key, kind, status, time(), json.dumps(payload))
            )
        return key

    def update(self, key: str, status: str, payload: dict) -> None:
        with closing(sqlite3.connect(self.db)) as db, db:
            db.execute(
                "UPDATE records SET status=?, payload=? WHERE id=?", (status, json.dumps(payload), key)
            )

    def read(self, kind: str, key: str | None = None, limit: int = 50) -> list[dict]:
        with closing(sqlite3.connect(self.db)) as db:
            rows = db.execute(
                "SELECT id, status, created, payload FROM records WHERE kind=? AND (? IS NULL OR id=?) "
                "ORDER BY created DESC LIMIT ?",
                (kind, key, key, limit),
            ).fetchall()
        return [
            {
                "id": key,
                "status": status,
                "created": datetime.fromtimestamp(created, UTC).isoformat(),
                **json.loads(payload),
            }
            for key, status, created, payload in rows
        ]

    def agents(self) -> list[dict]:
        return [
            {"id": key, "name": name, "instructions": instructions, "preset": True}
            for key, (name, instructions) in PRESETS.items()
        ] + self.read("agent")

    def propose(self, action: actions.Action) -> dict:
        key = self.record("action", "pending", {"action": action.model_dump()})
        return self.read("action", key)[0]

    def decide(self, key: str, approve: bool) -> dict:
        with closing(sqlite3.connect(self.db)) as db, db:
            row = db.execute("SELECT payload FROM records WHERE kind='action' AND id=?", (key,)).fetchone()
            if row is None:
                raise HTTPException(404, "Approval request not found.")
            claimed = db.execute(
                "UPDATE records SET status=? WHERE id=? AND status='pending' AND created>?",
                ("executing" if approve else "denied", key, time() - 900),
            )
            if claimed.rowcount != 1:
                raise HTTPException(409, "This request expired or was already reviewed.")
        if approve:
            payload = json.loads(row[0])
            try:
                payload["result"] = actions.execute(action_adapter.validate_python(payload["action"]))
            except ValueError as error:
                self.update(key, "failed", {**payload, "error": str(error)})
            except Exception:
                # External clients can include credentials in exceptions. Keep them out of logs and history.
                self.update(key, "failed", {**payload, "error": "The action could not be completed."})
            else:
                self.update(key, "completed", payload)
        return self.read("action", key)[0]

    def start(self, kind: str, metadata: dict, work) -> dict:
        if not self.jobs.acquire(blocking=False):
            raise HTTPException(409, "Another team, training, or evaluation job is already running.")
        try:
            key = self.record(kind, "running", {"config": metadata, "progress": 0})

            def run():
                state = {"config": metadata, "progress": 0}

                def report(count, **detail):
                    state.update(progress=count, **detail)
                    self.update(key, "running", state)

                try:
                    state["result"] = work(key, report)
                    self.update(key, "completed", state)
                except ValueError as error:
                    self.update(key, "failed", {**state, "error": str(error)})
                except Exception:
                    log.exception("Local hub job failed")
                    self.update(key, "failed", {**state, "error": "Job failed. Check the local server log."})
                finally:
                    self.jobs.release()

            Thread(target=run, name=f"evidencelab-{kind}", daemon=True).start()
        except Exception:
            self.jobs.release()
            raise
        return self.read(kind, key)[0]


def hub(request: Request) -> Hub:
    return request.app.state.hub


@router.get("/models")
def models(request: Request):
    return hub(request).models.inventory() | {
        "actions": actions.capabilities(),
        "jev": bool(os.environ.get("EVIDENCELAB_TYPESAFE_API_KEY")),
        "training": (ROOT / "scripts/train.py").is_file(),
    }


@router.post("/chat")
def chat(body: ChatInput, request: Request):
    if body.messages[-1].role != "user":
        raise ValueError("The last chat message must come from the user.")
    # One user turn remains compatible with templates that reject the system role.
    messages = [message.model_dump() for message in body.messages]
    messages[-1]["content"] = f"Reply in {LANGUAGES[body.language]}.\n\n" + messages[-1]["content"]
    return hub(request).models.generate(body.model, messages, body.max_tokens)


@router.get("/agents")
def list_agents(request: Request):
    return hub(request).agents()


@router.post("/agents")
def create_agent(body: Agent, request: Request):
    instance = hub(request)
    key = instance.record("agent", "saved", body.model_dump())
    return instance.read("agent", key)[0]


@router.post("/teams")
def team(body: TeamRun, request: Request):
    instance = hub(request)
    roster = {agent["id"]: agent for agent in instance.agents()}
    if len(set(body.agent_ids)) != len(body.agent_ids) or any(key not in roster for key in body.agent_ids):
        raise ValueError("Choose up to five different agents from the roster.")
    team = [roster[key] for key in body.agent_ids]

    def work(_, report):
        trace = []
        for agent in team:
            report(len(trace), trace=trace, active=agent["id"])
            handoff = [{"name": step["name"], "output": step["text"][:3500]} for step in trace]
            result = instance.models.generate(
                body.model,
                [
                    {
                        "role": "user",
                        "content": (
                            f"You are {agent['name']}. Role: {agent['instructions']}\n"
                            f"Respond in {LANGUAGES[body.language]}. The team output is text for review. "
                            "Do not claim to have executed external actions.\n\n"
                            f"Original task:\n{body.task}\n\nPrevious handoffs:\n{json.dumps(handoff, ensure_ascii=False)}"
                        ),
                    }
                ],
                512,
            )
            trace.append({"agent_id": agent["id"], "name": agent["name"], **result})
            report(len(trace), trace=trace, active=None)
        return {"trace": trace, "answer": trace[-1]["text"]}

    return instance.start("team", body.model_dump(), work)


@router.post("/actions")
def propose(body: actions.Action, request: Request):
    return hub(request).propose(body)


@router.post("/actions/draft")
def draft(body: Draft, request: Request):
    instance = hub(request)
    enabled = [kind for kind, available in actions.capabilities().items() if available]
    result = instance.models.generate(
        body.model,
        [
            {
                "role": "user",
                "content": (
                    f"Draft exactly one action as a JSON object, no markdown. Enabled kinds: {enabled}. "
                    "Use kind and the matching fields: web_search query, search_engine query, web_read title, open_browser url, "
                    "read_file filename, telegram recipient and text, whatsapp recipient and text. "
                    f"For search and Wikipedia set language to '{body.language}'. Never invent a recipient or filename. "
                    "If necessary fields are missing return {}. Task:\n" + body.task
                ),
            }
        ],
        512,
    )
    try:
        proposed = action_adapter.validate_json(
            result["text"].removeprefix("\x60\x60\x60json").removesuffix("\x60\x60\x60").strip()
        )
    except ValueError as error:
        raise ValueError(
            "The model did not produce a valid action. Specify the destination and required fields."
        ) from error
    if proposed.kind not in enabled:
        raise ValueError("The proposed integration is disabled.")
    return instance.propose(proposed)


@router.post("/actions/{key}/review")
def review(key: str, body: Approval, request: Request):
    return hub(request).decide(key, body.approve)


@router.get("/datasets")
def datasets(request: Request):
    instance = hub(request)
    with instance.dataset_lock:
        return [json.loads(path.read_text()) for path in sorted(instance.datasets.glob("*/manifest.json"))]


@router.post("/datasets/demo")
def demo_dataset(request: Request):
    instance = hub(request)
    samples = [
        ("train", "Return only the number. What is 6 plus 5?", "11"),
        ("train", "Reply with one Italian word. Translate 'cat'.", "gatto"),
        ("validation", "Return only the number. What is 2 plus 2?", "4"),
        ("validation", "Reply with one Spanish word. Translate 'cat'.", "gato"),
        (
            "validation",
            "Name the Python keyword for returning a value. Reply with only the keyword.",
            "return",
        ),
        ("test", "Return only the number. What is 9 minus 2?", "7"),
        ("test", "Reply with one Italian word. Translate 'book'.", "libro"),
        ("test", "Name the Python keyword for importing a module. Reply with only the keyword.", "import"),
    ]
    content = "\n".join(
        json.dumps({"split": split, "prompt": prompt, "completion": answer})
        for split, prompt, answer in samples
    ).encode()
    with instance.dataset_lock:
        return experiments.import_dataset(instance.datasets, "Quickstart (8 authored examples)", content)


@router.post("/datasets")
def upload_dataset(request: Request, file: UploadFile = File(...)):
    instance = hub(request)
    with instance.dataset_lock:
        return experiments.import_dataset(
            instance.datasets, Path(file.filename or "dataset.jsonl").name, file.file.read(1_000_001)
        )


@router.post("/experiments")
def experiment(body: experiments.Experiment, request: Request):
    instance = hub(request)
    with instance.dataset_lock:
        rows = experiments.examples(instance.datasets, body.dataset, body.split)[: body.limit]
    experiments.validate_experiment(body, rows)
    return instance.start(
        "experiment",
        body.model_dump(),
        lambda _, report: experiments.evaluate(
            instance.models,
            body,
            rows,
            lambda count, samples: report(count, samples=samples),
        ),
    )


@router.post("/training")
def train(body: Train, request: Request):
    instance = hub(request)
    if not (ROOT / "scripts/train.py").is_file():
        raise ValueError("The browser training launcher requires a repository checkout.")
    with instance.dataset_lock:
        for split in ("train", "validation"):
            if not experiments.examples(instance.datasets, body.dataset, split):
                raise ValueError("Training needs both train and validation examples.")
    import importlib.util

    if any(
        importlib.util.find_spec(package) is None
        for package in ("torch", "transformers", "trl", "peft", "datasets")
    ):
        raise ValueError(
            "Install training dependencies with pip install -e '.[train]' (or '.[qlora]' for NF4)."
        )

    def work(key, _):
        path = instance.root / "training" / key
        path.parent.mkdir(parents=True, exist_ok=True)
        env = local_runtime_env()
        env.update(HF_HUB_OFFLINE="1", HF_DATASETS_OFFLINE="1", PYTHONUNBUFFERED="1")
        log_file = path.parent / f"{key}.log"
        with instance.models.lock:
            instance.models.loaded = None
            with log_file.open("xb") as stream:
                exit_code = subprocess.run(
                    [
                        sys.executable,
                        str(ROOT / "scripts/train.py"),
                        "--dataset",
                        str(instance.datasets / body.dataset),
                        "--model",
                        body.model,
                        "--revision",
                        body.revision,
                        "--max-steps",
                        str(body.max_steps),
                        "--rank",
                        str(body.rank),
                        "--quantization",
                        body.quantization,
                        "--output",
                        str(path),
                    ],
                    cwd=ROOT,
                    env=env,
                    stdout=stream,
                    stderr=subprocess.STDOUT,
                    check=False,
                ).returncode
        if exit_code:
            raise ValueError(
                f"Training exited with status {exit_code}. See the local training log for run {key}."
            )
        return {"adapter": key, "model_id": MODEL_IDS[body.model]}

    return instance.start("training", body.model_dump(), work)


@router.get("/jobs/{kind}")
def history(kind: Literal["team", "experiment", "training", "action"], request: Request):
    records = hub(request).read(kind, limit=25)
    return [
        {k: v for k, v in row.items() if k not in {"samples", "trace", "result"}}
        | (
            {"metrics": {k: v for k, v in row["result"].items() if k != "samples"}}
            if kind == "experiment" and "result" in row
            else {}
        )
        for row in records
    ]


@router.get("/jobs/{kind}/{key}")
def job(kind: Literal["team", "experiment", "training", "action"], key: str, request: Request):
    instance = hub(request)
    rows = instance.read(kind, key)
    if not rows:
        raise HTTPException(404, "Record not found.")
    if kind == "training":
        try:
            events = json.loads((instance.root / "training" / key / "history.json").read_text())
            rows[0]["progress"] = max((event.get("step", 0) for event in events), default=0)
        except (OSError, json.JSONDecodeError):
            pass
    return rows[0]
