from threading import Lock

import httpx
import pytest
from fastapi.testclient import TestClient

from evidencelab import hub_models
from evidencelab.api import create_app
from evidencelab.hub_models import LocalModels, ModelRef
from evidencelab.runtime_security import local_runtime_env
from evidencelab.service import Lab


def test_http_guard_protects_notebooks_and_rejects_oversized_bodies(tmp_path):
    lab = Lab(tmp_path, seed=False)
    with TestClient(create_app(lab)) as client:
        assert client.get("/api/notebooks", headers={"Host": "foreign.example"}).status_code == 403
        assert client.get("/api/notebooks", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403
        response = client.get("/api/notebooks")
        assert response.status_code == 200
        assert response.headers["Cache-Control"] == "no-store"
        assert response.headers["X-Frame-Options"] == "DENY"
        response = client.post("/api/notebooks", content=b"{}", headers={"Content-Length": "3000000"})
        assert response.status_code == 413

        def chunks():
            for _ in range(3):
                yield b" " * 1024**2

        streamed = client.post("/api/notebooks", content=chunks(), headers={"Content-Type": "application/json"})
        assert streamed.status_code == 413
    lab.store.close()


def test_validation_and_child_environment_do_not_expose_credentials(tmp_path, monkeypatch):
    monkeypatch.setenv("EVIDENCELAB_SMTP_PASSWORD", "synthetic-mail-value")
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-provider-value")
    monkeypatch.setenv("HF_HOME", str(tmp_path))
    env = local_runtime_env()
    assert "EVIDENCELAB_SMTP_PASSWORD" not in env and "OPENAI_API_KEY" not in env
    assert env["HF_HOME"] == str(tmp_path)

    lab = Lab(tmp_path / "lab", seed=False)
    with TestClient(create_app(lab)) as client:
        response = client.post("/api/notebooks", json={"title": {"unexpected": "synthetic-secret-value"}})
        assert response.status_code == 422
        assert "synthetic-secret-value" not in response.text
    lab.store.close()


def test_ollama_remote_alias_is_not_sent_the_prompt(tmp_path, monkeypatch):
    requests = []

    def handler(request):
        requests.append(request.url.path)
        return httpx.Response(200, json={"models": [{"name": "an-alias:latest", "remote_host": "https://ollama.com"}]})

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    monkeypatch.setattr(hub_models.httpx, "Client", lambda **kwargs: client)
    models = LocalModels(tmp_path, Lock())
    with pytest.raises(ValueError, match="downloaded local Ollama"):
        models.generate(ModelRef(provider="ollama", name="an-alias"), [{"role": "user", "content": "local only"}])
    assert requests == ["/api/tags"]
