import io

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from evidencelab.api import create_app
from evidencelab.schema import Paper
from evidencelab.service import Lab


@pytest.fixture
def client(tmp_path):
    lab = Lab(tmp_path)
    with TestClient(create_app(lab)) as session:
        yield session
    lab.store.close()


def test_demo_end_to_end(client):
    assert client.get("/api/health").json()["status"] == "ready"
    overview = client.get("/api/overview").json()
    assert overview["papers"] == 108
    response = client.post("/api/ask", json={"question": overview["questions"][0]["question"]})
    assert response.status_code == 200
    result = response.json()
    assert result["evidence"] and result["citations"]
    for c in result["citations"]:
        paper = client.get("/api/papers/" + c["paper_id"]).json()
        assert paper["text"][c["start"] : c["end"]] == c["quote"]
    assert len(client.get("/api/runs?kind=query").json()) == 1


def test_ingestion_updates_index(client):
    response = client.post(
        "/api/ingest/text",
        json={
            "title": "Antarctic experiment",
            "text": "Quasiparticles in Antarctic instruments exhibit superconducting coherence under controlled conditions.",
        },
    )
    assert response.status_code == 200
    result = client.post("/api/ask", json={"question": "Antarctic quasiparticles coherence"}).json()
    assert result["evidence"][0]["paper_id"] == response.json()["id"]
    assert client.get("/api/overview").json()["papers"] == 109
    assert client.get("/api/papers/missing").status_code == 404


def test_validation_and_explicit_errors(client):
    assert client.post("/api/ask", json={"question": "ok"}).status_code == 422
    assert client.post("/api/ask", json={"question": "retrieval", "k": 0}).status_code == 422
    assert client.post("/api/ingest/arxiv", json={"identifier": "http://127.0.0.1"}).status_code == 422
    assert (
        client.post("/api/ask", json={"question": "protein expression", "mode": "dense"}).status_code == 400
    )
    assert client.post("/api/ingest/pdf", files={"file": ("bad.pdf", b"not a pdf")}).status_code == 400
    writer = PdfWriter()
    writer.add_blank_page(100, 100)
    stream = io.BytesIO()
    writer.write(stream)
    assert client.post("/api/ingest/pdf", files={"file": ("scan.pdf", stream.getvalue())}).status_code == 400


def test_benchmarks_agents_and_artifacts(client):
    benchmark = client.post("/api/benchmarks", json={"modes": ["bm25", "hybrid"], "k": 3})
    assert benchmark.status_code == 200 and benchmark.json()["query_count"] == 24
    result = client.post(
        "/api/investigate", json={"question": "Protein expression in cells", "architecture": "swarm"}
    )
    assert result.status_code == 200 and result.json()["trace"]
    assert client.get("/api/vectors").json()["representation"] == "TF-IDF"
    assert client.get("/api/graph").json()["edges"]
    assert client.get("/api/training").json() == []
    assert "math" in client.get("/api/foundation").json()["suites"]
    assert client.get("/api/foundation").json()["runs"] == []


def test_sqlite_restart(tmp_path):
    first = Lab(tmp_path, seed=False)
    first.add(Paper(id="1", title="Persistent", text="Persistent scientific evidence retrieval."))
    first.store.close()
    second = Lab(tmp_path, seed=False)
    assert len(second.store.papers()) == 1 and second.index.search("persistent")[0]["paper_id"] == "1"
    second.store.close()


def test_cross_origin_upload_rejected(client):
    response = client.post(
        "/api/ingest/text",
        json={"title": "Unwanted", "text": "Untrusted third party content."},
        headers={"Origin": "https://untrusted.example"},
    )
    assert response.status_code == 403


def test_architecture_label_persists_with_benchmark(tmp_path):
    lab = Lab(tmp_path)
    result = lab.benchmark(["bm25"], 1, 42, architecture_label="single")
    assert result["architecture"] == "single"
    assert lab.store.runs("benchmark")[0]["architecture"] == "single"
    lab.store.close()
