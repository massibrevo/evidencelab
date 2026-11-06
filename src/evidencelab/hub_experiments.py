"""Dataset ingestion, matched local evaluations, and optional System One decisions."""

import hashlib
import json
import math
import os
import re
import unicodedata
from pathlib import Path
from statistics import mean
from time import perf_counter
from typing import Literal

import httpx
from pydantic import Field

from .hub_models import Input, LocalModels, ModelRef


class DatasetRow(Input):
    split: Literal["train", "validation", "test"]
    prompt: str = Field(min_length=1, max_length=8000)
    completion: str = Field(min_length=1, max_length=4000)
    group: str = Field(default="", max_length=200)


def normalized(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def import_dataset(root: Path, name: str, content: bytes) -> dict:
    if not content or len(content) > 1_000_000:
        raise ValueError("Upload a UTF-8 JSONL file under 1 MB.")
    rows: dict[str, list[dict]] = {"train": [], "validation": [], "test": []}
    splits: dict[tuple[str, str], str] = {}
    prompts = set()
    for number, line in enumerate(content.decode("utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = DatasetRow.model_validate_json(line)
        except ValueError as error:
            raise ValueError(f"Invalid dataset row {number}. See the JSONL format in docs/hub.md.") from error
        prompt = normalized(row.prompt)
        if prompt in prompts:
            raise ValueError(f"Duplicate prompt on line {number}. Use one row per prompt.")
        prompts.add(prompt)
        group = ("group", row.group) if row.group else ("prompt", prompt)
        if splits.setdefault(group, row.split) != row.split:
            raise ValueError(f"Group crosses dataset splits on line {number}.")
        rows[row.split].append(
            {
                "prompt": row.prompt,
                "completion": row.completion,
                "paper_ids": [json.dumps(group, ensure_ascii=False)],
            }
        )
    if not any(rows.values()):
        raise ValueError("The dataset has no examples.")
    by_split = {}
    for split, examples in rows.items():
        by_split[split] = "".join(
            json.dumps(example, ensure_ascii=False) + "\n" for example in examples
        ).encode()
    digest = hashlib.sha256(content).hexdigest()
    destination = root / digest
    destination.mkdir(parents=True, exist_ok=True)
    for split, data in by_split.items():
        (destination / f"{split}.jsonl").write_bytes(data)
    info = {
        "id": digest,
        "name": name[:200],
        "upstream_split": "train",
        "provenance": "user-supplied splits; original upstream status not independently verified",
        "counts": {split: len(examples) for split, examples in rows.items()},
        "sha256": {split: hashlib.sha256(data).hexdigest() for split, data in by_split.items()},
    }
    (destination / "manifest.json").write_text(json.dumps(info))
    return info


def examples(root: Path, dataset: str, split: str) -> list[dict]:
    folder = root / dataset
    try:
        info = json.loads((folder / "manifest.json").read_text())
        content = (folder / f"{split}.jsonl").read_bytes()
    except OSError as error:
        raise ValueError("Dataset not found. Upload it first.") from error
    if hashlib.sha256(content).hexdigest() != info["sha256"][split]:
        raise ValueError("Dataset contents differ from the saved manifest.")
    return [json.loads(line) for line in content.splitlines()]


class Experiment(Input):
    dataset: str = Field(pattern=r"^[a-f0-9]{64}$")
    split: Literal["validation", "test"] = "validation"
    limit: int = Field(default=10, ge=1, le=100)
    model: ModelRef | None = None
    decision: Literal["local", "jev", "systemone"] = "local"
    decision_model: str = Field(default="jev-latest", min_length=1, max_length=120)
    instructions: str = Field(default="Choose the best label for the input.", min_length=1, max_length=500)
    criteria: dict[str, str] = Field(default_factory=dict, max_length=20)
    allow_external: bool = False


def system_one(spec: Experiment, state: str) -> dict:
    from .hub_models import local_base

    if spec.decision == "jev":
        token = os.environ.get("EVIDENCELAB_TYPESAFE_API_KEY")
        if not token or not spec.allow_external:
            raise ValueError(
                "Jev requires a TypeSafe API key and explicit consent to send the selected split."
            )
        base, headers = "https://api.typesafe.ai/v1", {"Authorization": f"Bearer {token}"}
    else:
        base = local_base("EVIDENCELAB_SYSTEMONE_URL", "http://127.0.0.1:8090/v1")
        headers = {}
    start = perf_counter()
    try:
        with httpx.Client(timeout=30, trust_env=False) as client:
            response = client.post(
                f"{base}/systemone",
                headers=headers,
                json={
                    "state": state,
                    "model": spec.decision_model,
                    "questions": {
                        "label": {
                            "type": "choice",
                            "instructions": spec.instructions,
                            "criteria": spec.criteria,
                        }
                    },
                },
            )
            response.raise_for_status()
            payload = response.json()
        answer = payload["answers"]["label"]
        probabilities = answer["probabilities"]
        if (
            answer["choice"] not in spec.criteria
            or set(probabilities) != set(spec.criteria)
            or any(not isinstance(p, (int, float)) or not 0 <= p <= 1 for p in probabilities.values())
            or not math.isclose(sum(probabilities.values()), 1, abs_tol=0.02)
        ):
            raise ValueError("The System One endpoint returned an invalid choice distribution.")
        return {
            "text": answer["choice"],
            "probabilities": probabilities,
            "confidence": answer.get("confidence"),
            "resolved_model": payload.get("model"),
            "latency_ms": (perf_counter() - start) * 1000,
        }
    except httpx.HTTPStatusError as error:
        raise ValueError(f"System One API returned HTTP {error.response.status_code}.") from None
    except (httpx.RequestError, KeyError, TypeError) as error:
        raise ValueError("Could not read a System One response. Check configuration.") from error


def validate_experiment(spec: Experiment, rows: list[dict]) -> None:
    if not rows:
        raise ValueError("The selected split is empty.")
    if spec.decision == "local" and not spec.model:
        raise ValueError("Select a local chat model.")
    if spec.decision == "jev" and (
        not spec.allow_external or not os.environ.get("EVIDENCELAB_TYPESAFE_API_KEY")
    ):
        raise ValueError("Configure Jev and confirm external processing for this run.")
    if spec.decision != "local" or spec.criteria:
        if (
            not 2 <= len(spec.criteria) <= 20
            or any(
                not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", label) or len(desc) > 250
                for label, desc in spec.criteria.items()
            )
            or len({normalized(label) for label in spec.criteria}) != len(spec.criteria)
        ):
            raise ValueError("Define 2–20 unique choice labels (letters, numbers, underscores or dashes).")
        if any(row["completion"] not in spec.criteria for row in rows):
            raise ValueError("Every expected answer in a classification run must be a defined choice label.")


def evaluate(models: LocalModels, spec: Experiment, rows: list[dict], progress) -> dict:
    samples = []
    for index, row in enumerate(rows):
        if spec.decision == "local":
            prompt = (
                f"{spec.instructions}\nReturn exactly one label and nothing else. Options: "
                f"{json.dumps(spec.criteria, ensure_ascii=False)}\n\nInput: {row['prompt']}"
                if spec.criteria
                else row["prompt"]
            )
            result = models.generate(spec.model, [{"role": "user", "content": prompt}], 128)
        else:
            result = system_one(spec, row["prompt"])
        expected = row["completion"]
        sample = {
            **result,
            "index": index + 1,
            "expected": expected,
            "correct": normalized(expected) == normalized(result["text"]),
        }
        if "probabilities" in result:
            sample["brier"] = sum(
                (p - (label == expected)) ** 2 for label, p in result["probabilities"].items()
            )
        samples.append(sample)
        progress(index + 1, samples)
    accuracy = mean(sample["correct"] for sample in samples)
    n = len(samples)
    z2 = 1.96**2
    center = (accuracy + z2 / (2 * n)) / (1 + z2 / n)
    radius = 1.96 * math.sqrt((accuracy * (1 - accuracy) + z2 / (4 * n)) / n) / (1 + z2 / n)
    return {
        "exact_match": accuracy,
        "wilson_95": [max(0, center - radius), min(1, center + radius)],
        "mean_latency_ms": mean(s["latency_ms"] for s in samples),
        "samples": samples,
        "mean_brier": mean(s["brier"] for s in samples) if "brier" in samples[0] else None,
    }
