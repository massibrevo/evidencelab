import csv
import io
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from evidencelab.analytics import benchmark_catalog
from evidencelab.api import create_app
from evidencelab.figures import render_benchmark
from evidencelab.notebooks import NotebookWorkspace
from evidencelab.service import Lab


@pytest.fixture
def lab_client(tmp_path):
    lab = Lab(tmp_path)
    with TestClient(create_app(lab)) as client:
        yield lab, client
    lab.store.close()


def test_published_reference_is_not_a_local_run(lab_client):
    lab, client = lab_client
    data = client.get("/api/analytics").json()
    assert data["counts"] == {} and data["window_size"] == 0
    reference = client.get("/api/experiments").json()
    assert reference and reference[0]["provenance"] == "reference"
    assert not lab.store.runs("benchmark")
    assert data["resources"]["rss_mb"] > 0
    assert data["generated_tokens"] is None


def test_notebook_roundtrip_conflicts_and_execution_gate(lab_client):
    _, client = lab_client
    registry = client.get("/api/notebooks").json()
    assert len(registry["notebooks"]) >= 4
    assert not registry["execution_enabled"]
    book = client.post("/api/notebooks", json={"title": "A controlled experiment"}).json()
    code = next(c for c in book["notebook"]["cells"] if c["cell_type"] == "code")
    code["source"] = "print(42)"
    saved = client.put(
        "/api/notebooks/" + book["id"], json={"notebook": book["notebook"], "revision": book["revision"]}
    )
    assert saved.status_code == 200
    assert saved.json()["revision"] != book["revision"]
    stale = client.put(
        "/api/notebooks/" + book["id"], json={"notebook": book["notebook"], "revision": book["revision"]}
    )
    assert stale.status_code == 400 and "another tab" in stale.json()["detail"]
    response = client.post(
        "/api/notebooks/" + book["id"] + "/run",
        json={"revision": saved.json()["revision"], "cell_id": code["id"]},
    )
    assert response.status_code == 400 and "disabled" in response.json()["detail"]
    assert not saved.json()["kernel_running"]


def test_notebook_isolation_and_invalid_content(tmp_path):
    workspace = NotebookWorkspace(tmp_path)
    with pytest.raises(ValueError, match="ID"):
        workspace.get("../README")
    book = workspace.create("Test")
    book["notebook"]["cells"][0]["id"] = book["notebook"]["cells"][1]["id"]
    with pytest.raises(ValueError, match="unique"):
        workspace.save(book["id"], book["notebook"], book["revision"])
    workspace.close()


def test_measured_figure_export_and_csv(lab_client):
    _, client = lab_client
    result = client.post(
        "/api/benchmarks",
        json={
            "modes": ["bm25", "tfidf"],
            "k": 2,
            "resamples": 500,
            "rewrite": True,
            "architecture": "single",
        },
    )
    assert result.status_code == 200
    run = result.json()
    assert run["resamples"] == 500 and run["architecture"] == "single"
    assert run["rows"][0]["metrics"]["recall"]["resamples"] == 500
    png = client.get(f"/api/experiments/{run['id']}/figure?chart=scores&format=png")
    assert png.status_code == 200 and png.content.startswith(b"\x89PNG")
    assert "image/png" in png.headers["content-type"]
    exported = client.get(f"/api/experiments/{run['id']}/csv")
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert len(rows) == 48 and all(r["run_id"] == run["id"] for r in rows)
    assert client.get("/api/experiments/missing/figure").status_code == 404
    assert client.get(f"/api/experiments/{run['id']}/figure?format=html").status_code == 422


@pytest.mark.parametrize(
    "chart,fmt,magic",
    [("latency", "svg", b"<?xml"), ("heatmap", "png", b"\x89PNG"), ("tradeoff", "pdf", b"%PDF")],
)
def test_matplotlib_figure_families(tmp_path, chart, fmt, magic):
    lab = Lab(tmp_path)
    reference = benchmark_catalog(lab)[0]
    result = render_benchmark(reference, chart, fmt=fmt, theme="paper", palette="accessible")
    assert result.startswith(magic)
    assert len(result) > 2000
    lab.store.close()


def test_counts_are_not_limited_to_activity_window(lab_client):
    lab, client = lab_client
    now = datetime.now(UTC).isoformat()
    for i in range(105):
        lab.store.save_run(
            {
                "id": str(i),
                "created": now,
                "answer": "An excerpt",
                "citations": [],
                "abstained": False,
                "latency_ms": 1.0,
            },
            "query",
        )
    analytics = client.get("/api/analytics").json()
    assert analytics["counts"]["query"] == 105
    assert analytics["window_size"] == 100
    assert client.get("/api/overview").json()["runs"] == 105
    assert analytics["cited_answers"] == 0 and analytics["answered"] == 100


def test_malformed_notebook_returns_validation_error(lab_client):
    _, client = lab_client
    doc = client.post("/api/notebooks", json={"title": "Validation"}).json()
    response = client.put("/api/notebooks/" + doc["id"], json={"notebook": {}, "revision": doc["revision"]})
    assert response.status_code == 400
    for cells in (None, [7], [{"source": [42]}]):
        malformed = {**doc["notebook"], "cells": cells}
        response = client.put(
            "/api/notebooks/" + doc["id"],
            json={"notebook": malformed, "revision": doc["revision"]},
        )
        assert response.status_code == 400


def test_figure_cache_preserves_identical_export(tmp_path):
    from evidencelab.figures import FIGURE_CACHE

    lab = Lab(tmp_path)
    run = benchmark_catalog(lab)[0]
    first = render_benchmark(run, "scores", fmt="svg")
    size = len(FIGURE_CACHE)
    second = render_benchmark(run, "scores", fmt="svg")
    assert first == second and len(FIGURE_CACHE) == size
    lab.store.close()


def test_empirical_guides_are_calculated_and_merge_equal_values():
    from evidencelab.figures import distribution_guides

    guides = distribution_guides([1, 2, 3, 4])
    assert [label for label, _ in guides] == ["P10", "P50", "P90"]
    assert [value for _, value in guides] == pytest.approx([1.3, 2.5, 3.7])
    assert distribution_guides([2, 2]) == [("P10 / P50 / P90", 2)]


def test_ranked_export_describes_guides_and_honours_controls(lab_client):
    lab, client = lab_client
    run = benchmark_catalog(lab)[0]
    endpoint = f"/api/experiments/{run['id']}/figure?chart=ranking&format=svg&palette=muted"
    result = client.get(endpoint)
    assert result.status_code == 200
    assert b"Dashed guides:" in result.content and b"stroke-dasharray" in result.content
    plain = client.get(endpoint + "&guides=false&value_labels=false&intervals=false")
    assert plain.status_code == 200
    assert b"Dashed guides:" not in plain.content
    assert plain.content != result.content
