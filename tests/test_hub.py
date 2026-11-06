import json
import time

import httpx
from fastapi.testclient import TestClient

from evidencelab import hub_actions
from evidencelab.api import create_app
from evidencelab.hub_experiments import Experiment, system_one
from evidencelab.hub_models import LocalModels
from evidencelab.service import Lab

MODEL = {"provider": "ollama", "name": "local-test"}


def finished(client, kind, key):
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        job = client.get(f"/api/hub/jobs/{kind}/{key}").json()
        if job["status"] != "running":
            return job
        time.sleep(0.02)
    raise AssertionError("Local test job did not finish")


def test_local_chat_team_and_experiment(tmp_path, monkeypatch):
    prompts = []

    def generate(self, model, messages, limit):
        prompts.append(messages[-1]["content"])
        return {"text": "4", "tokens": 1, "latency_ms": 1.0}

    monkeypatch.setattr(LocalModels, "generate", generate)
    lab = Lab(tmp_path, seed=False)
    with TestClient(create_app(lab)) as client:
        result = client.post(
            "/api/hub/chat",
            json={
                "model": MODEL,
                "language": "it",
                "messages": [{"role": "user", "content": "2+2"}],
            },
        )
        assert result.json()["text"] == "4"
        assert prompts[0] == "Reply in Italian.\n\n2+2"
        assert client.get("/api/hub/agents", headers={"Host": "untrusted.example"}).status_code == 403
        agent = client.post("/api/hub/agents", json={"name": "Verifier", "instructions": "Check arithmetic."})
        team = client.post(
            "/api/hub/teams",
            json={
                "model": MODEL,
                "agent_ids": ["atlas", agent.json()["id"]],
                "task": "Check 2+2",
            },
        )
        trace = finished(client, "team", team.json()["id"])["result"]["trace"]
        assert [step["name"] for step in trace] == ["Atlas", "Verifier"]
        assert '"output": "4"' in prompts[-1]
        data = b'{"split":"validation","prompt":"2+2","completion":"4"}\n'
        dataset = client.post("/api/hub/datasets", files={"file": ("demo.jsonl", data)}).json()
        assert dataset["counts"]["validation"] == 1
        run = client.post("/api/hub/experiments", json={"dataset": dataset["id"], "model": MODEL})
        report = finished(client, "experiment", run.json()["id"])["result"]
        assert report["exact_match"] == 1
        assert report["samples"][0]["expected"] == "4"
        assert client.get("/api/hub/jobs/experiment").json()[0]["metrics"]["exact_match"] == 1
        assert client.post("/api/hub/datasets/demo").json()["counts"] == {
            "train": 2,
            "validation": 3,
            "test": 3,
        }
        overlap = "\n".join(
            json.dumps({"split": split, "prompt": split, "completion": "x", "group": "same"})
            for split in ("train", "test")
        )
        assert client.post("/api/hub/datasets", files={"file": ("bad.jsonl", overlap)}).status_code == 400
    lab.store.close()


def test_action_requires_explicit_single_use_approval(tmp_path, monkeypatch):
    seen = []

    def execute(action):
        seen.append(action.query)
        return {"results": []}

    monkeypatch.setattr(hub_actions, "execute", execute)
    lab = Lab(tmp_path, seed=False)
    with TestClient(create_app(lab)) as client:
        body = {"kind": "web_search", "query": "flash cards"}
        pending = client.post("/api/hub/actions", json=body).json()
        assert pending["status"] == "pending" and seen == []
        route = f"/api/hub/actions/{pending['id']}/review"
        assert client.post(route, json={"approve": True}).json()["status"] == "completed"
        assert client.post(route, json={"approve": True}).status_code == 409
        assert seen == ["flash cards"]
        pending = client.post("/api/hub/actions", json=body).json()
        route = f"/api/hub/actions/{pending['id']}/review"
        assert client.post(route, json={"approve": False}).json()["status"] == "denied"
        assert client.post(route, json={"approve": True}).status_code == 409
        assert seen == ["flash cards"]
        assert (
            client.post(
                "/api/hub/actions", json={"kind": "read_file", "filename": "../secrets.txt"}
            ).status_code
            == 422
        )
    lab.store.close()


def test_jev_choice_contract(monkeypatch):
    def respond(request):
        assert request.url == httpx.URL("https://api.typesafe.ai/v1/systemone")
        assert request.headers["Authorization"] == "Bearer test"
        payload = json.loads(request.content)
        assert payload["questions"]["label"]["criteria"] == {"red": "Red", "blue": "Blue"}
        assert payload["state"] == "A red object"
        return httpx.Response(
            200,
            json={
                "model": "jev-test",
                "answers": {
                    "label": {
                        "type": "choice",
                        "choice": "red",
                        "confidence": 0.7,
                        "probabilities": {"red": 0.9, "blue": 0.1},
                    }
                },
            },
        )

    client = httpx.Client
    monkeypatch.setenv("EVIDENCELAB_TYPESAFE_API_KEY", "test")
    monkeypatch.setattr(
        httpx, "Client", lambda **kwargs: client(transport=httpx.MockTransport(respond), **kwargs)
    )
    result = system_one(
        Experiment(
            dataset="0" * 64, decision="jev", allow_external=True, criteria={"red": "Red", "blue": "Blue"}
        ),
        "A red object",
    )
    assert result["text"] == "red"
    assert result["probabilities"]["red"] == 0.9
    assert result["resolved_model"] == "jev-test"
