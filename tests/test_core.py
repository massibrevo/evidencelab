import hashlib
import json
import math

import pytest

from evidencelab.agents import ResearchAgents
from evidencelab.datasets import grouped_split, save_splits
from evidencelab.evaluation import answer_metrics, bootstrap, evaluate, ranking_metrics
from evidencelab.foundation import plan
from evidencelab.ingest import chunk_paper, semantic_chunks
from evidencelab.models import ExtractiveGenerator
from evidencelab.retrieval import Index, rewrite_query
from evidencelab.schema import Paper
from evidencelab.service import data_dir


@pytest.mark.parametrize("mode", ["bm25", "tfidf", "hybrid", "graph"])
def test_known_evidence_ranks_first(index, mode):
    assert index.search("low rank adapters memory", mode, 2)[0]["paper_id"] == "a"


def test_abstention_and_empty(index):
    answer = ExtractiveGenerator().generate("xylophonically zzyzx", index.search("xylophonically zzyzx"))
    assert answer["abstained"] and not answer["citations"]
    assert Index([]).search("hello world") == []
    assert Index([]).projection()["points"] == []


def test_offsets_cover_all_text():
    text = "First sentence about evidence. " * 100
    paper = Paper(id="long", title="Long", text=text)
    chunks = chunk_paper(paper, 150, 25)
    covered = set()
    for c in chunks:
        assert text[c.start : c.end] == c.text
        assert len(c.text) <= 150
        covered.update(range(c.start, c.end))
    assert covered == set(range(len(text)))
    assert len({c.id for c in chunks}) == len(chunks)
    with pytest.raises(ValueError):
        chunk_paper(paper, 150, 150)


def test_exact_citation_ranges(index, papers):
    answer = ExtractiveGenerator().generate("low rank adapters", index.search("low rank adapters"))
    lookup = {p.id: p.text for p in papers}
    for c in answer["citations"]:
        assert lookup[c["paper_id"]][c["start"] : c["end"]] == c["quote"]


def test_paper_deduplication():
    paper = Paper(id="one", title="Evidence", text="Scientific evidence retrieval. " * 300)
    assert len(Index([paper]).search("scientific evidence", k=10)) == 1


def test_optional_features_fail_explicitly(index):
    with pytest.raises(ValueError, match="Dense retrieval"):
        index.search("retrieval", "dense")
    with pytest.raises(ValueError, match="reranking"):
        index.search("retrieval", rerank=True)


def test_projection_and_rewrite(index):
    p = index.projection()
    assert p["representation"] == "TF-IDF"
    assert len(p["points"]) == len(index.chunks)
    assert "low rank" in rewrite_query("QLoRA memory")


def test_semantic_chunks_preserve_offsets(papers):
    import numpy as np

    class Encoder:
        def encode(self, texts, **kwargs):
            return np.eye(len(texts))

    chunks = semantic_chunks(papers[0], Encoder())
    assert all(papers[0].text[c.start : c.end] == c.text for c in chunks)


def test_metric_hand_calculation():
    result = ranking_metrics(["x", "a", "b"], ["a", "b"], 3)
    assert result["recall"] == 1 and result["mrr"] == 0.5
    assert result["ndcg"] == pytest.approx((1 / math.log2(3) + 0.5) / (1 + 1 / math.log2(3)))
    assert ranking_metrics(["a", "a"], ["a", "b"], 2)["recall"] == 0.5
    assert ranking_metrics([], ["a"], 2)["mrr"] == 0


def test_ci_reproducible():
    assert bootstrap([0, 1, 1], 7) == bootstrap([0, 1, 1], 7)
    assert bootstrap([1, 1, 1])["low"] == 1
    with pytest.raises(ValueError):
        bootstrap([])


def test_benchmark_artifact(index):
    queries = [
        {"id": "1", "question": "low rank adapters", "relevant": ["a"]},
        {"id": "2", "question": "scientific evidence", "relevant": ["b"]},
    ]
    run = evaluate(index, queries, ["bm25", "hybrid"], k=2)
    assert run["rows"][0]["metrics"]["recall"]["mean"] == 1
    assert run["paired"][0]["delta_recall"]["mean"] == 0
    assert len(run["corpus_sha256"]) == 64
    assert run["rows"][0]["queries"][0]["metrics"]["faithfulness"] is None
    with pytest.raises(ValueError):
        evaluate(index, queries + queries, ["bm25"])


def test_citation_integrity_is_not_entailment():
    result = answer_metrics(
        {"answer": "claim", "citations": [{"paper_id": "a", "start": 0, "end": 4, "quote": "fake"}]},
        None,
        {"a": "real"},
    )
    assert result["citation_integrity"] == 0 and result["faithfulness"] is None


@pytest.mark.parametrize("architecture", ["single", "supervisor", "hierarchical", "swarm"])
def test_workflows(index, architecture):
    result = ResearchAgents(index).investigate(
        "Compare low rank adapters and retrieval evidence", architecture
    )
    assert result["trace"][0]["node"] == "plan"
    assert result["trace"][-1]["node"] == "remember"
    assert result["citations"] and len(result["trace"]) < 15


def test_reflection_bounded_and_memory_isolated(index):
    agents = ResearchAgents(index)
    a = agents.investigate("xylophonically zzyzx", "swarm", thread_id="a")
    assert sum(e["node"] == "reflect" for e in a["trace"]) == 1 and a["abstained"]
    b = agents.investigate("retrieval evidence", "swarm", thread_id="a")
    c = agents.investigate("retrieval evidence", "swarm", thread_id="b")
    assert len(b["memory"]) == 2 and len(c["memory"]) == 1


def test_groups_never_leak(tmp_path):
    records = [{"id": str(i), "paper_ids": [str(i // 2)]} for i in range(30)]
    records += [{"id": "bridge", "paper_ids": ["0", "1"]}]
    a = grouped_split(records)
    assert a == grouped_split(records)
    ids = {s: {pid for r in rows for pid in r["paper_ids"]} for s, rows in a.items()}
    assert not ids["train"] & ids["test"] and not ids["train"] & ids["validation"]
    assert not ids["validation"] & ids["test"]
    assert sum(map(len, a.values())) == len(records)
    manifest = save_splits(records, tmp_path)
    assert manifest["sha256"]["train"] == hashlib.sha256((tmp_path / "train.jsonl").read_bytes()).hexdigest()
    with pytest.raises(ValueError):
        grouped_split([{"id": "1", "paper_ids": []}])


def test_demo_is_attributed_pinned_and_has_gold():
    root = data_dir() / "demo"
    manifest = json.loads((root / "manifest.json").read_text())
    for file, checksum in manifest["files"].items():
        assert hashlib.sha256((root / file).read_bytes()).hexdigest() == checksum
    corpus = json.loads((root / "papers.json").read_text())
    ids = {p["id"] for p in corpus}
    queries = json.loads((root / "queries.json").read_text())
    assert all(set(q["relevant"]) <= ids for q in queries)
    assert len(queries) == 24 and len(corpus) == 108 and manifest["source_split"] == "dev"


def test_foundation_plan():
    assert plan("smoke")["limit"] == 10 and plan("general")["limit"] is None
    assert "gsm8k" in plan("math")["tasks"]
    assert "belebele_ita_Latn" in plan("multilingual")["tasks"]
    assert plan("general", limit=5)["scope"] == "smoke / limited"
    with pytest.raises(ValueError):
        plan("general", limit=0)
