import hashlib
import json
import math
import platform
import time
import uuid
from datetime import UTC, datetime
from typing import Callable

import numpy as np
import psutil

from .models import ExtractiveGenerator
from .retrieval import tokens


def ranking_metrics(retrieved: list[str], relevant: list[str], k: int) -> dict[str, float]:
    if k < 1 or not relevant:
        raise ValueError("Positive k and non-empty relevance judgments required")
    seen = set()
    unique = [x for x in retrieved if not (x in seen or seen.add(x))][:k]
    gold = set(relevant)
    hits = [int(doc in gold) for doc in unique]
    dcg = sum(hit / math.log2(i + 2) for i, hit in enumerate(hits))
    ideal = sum(1 / math.log2(i + 2) for i in range(min(len(gold), k)))
    return {
        "recall": sum(hits) / len(gold),
        "mrr": next((1 / (i + 1) for i, hit in enumerate(hits) if hit), 0.0),
        "ndcg": dcg / ideal,
    }


def bootstrap(values: list[float], seed: int = 42, samples: int = 2000) -> dict:
    if not values:
        raise ValueError("Cannot estimate an empty sample")
    a = np.asarray(values, dtype=float)
    rng = np.random.default_rng(seed)
    means = a[rng.integers(0, len(a), size=(samples, len(a)))].mean(axis=1)
    lo, hi = np.quantile(means, [0.025, 0.975])
    return {
        "mean": float(a.mean()),
        "low": float(lo),
        "high": float(hi),
        "n": len(a),
        "method": "query-level percentile bootstrap",
        "resamples": samples,
    }


def answer_metrics(prediction: dict, reference: str | None, paper_texts: dict[str, str]) -> dict:
    citations = prediction.get("citations", [])
    valid = [paper_texts.get(c["paper_id"], "")[c["start"] : c["end"]] == c["quote"] for c in citations]
    result = {
        "citation_integrity": sum(valid) / len(valid) if valid else None,
        "answer_exact_match": None,
        "answer_token_f1": None,
        "accuracy": None,
        "faithfulness": None,
        "hallucination_rate": None,
        "task_success": None,
    }
    if reference:
        a, b = tokens(prediction["answer"]), tokens(reference)
        from collections import Counter

        overlap = sum((Counter(a) & Counter(b)).values())
        result["answer_exact_match"] = float(a == b)
        result["answer_token_f1"] = 2 * overlap / (len(a) + len(b)) if a or b else 1.0
    return result


def evaluate(
    index,
    queries: list[dict],
    modes: list[str],
    k: int = 3,
    seed: int = 42,
    runner: Callable | None = None,
    generator=None,
    rewrite: bool = False,
    rerank: bool = False,
) -> dict:
    if not queries or len({q["id"] for q in queries}) != len(queries):
        raise ValueError("Need nonempty, uniquely identified evaluation queries")
    created = datetime.now(UTC).isoformat()
    corpus = [{"id": c.id, "text": c.text} for c in index.chunks]
    corpus_hash = hashlib.sha256(json.dumps(corpus, sort_keys=True).encode()).hexdigest()
    texts = {}
    # Restore exact paper offsets from chunks (overlapping assignments are identical).
    for c in index.chunks:
        old = texts.get(c.paper_id, "")
        chars = list(old.ljust(max(len(old), c.end)))
        chars[c.start : c.end] = c.text
        texts[c.paper_id] = "".join(chars)
    rows, configs = [], []
    for mode in dict.fromkeys(modes):
        records = []
        for q in queries:
            started = time.perf_counter()
            if runner is not None:
                output = runner(q["question"], mode)
                hits, answer = output["evidence"], output
            else:
                hits = index.search(q["question"], mode, k, rewrite=rewrite, rerank=rerank)
                answer = (generator or ExtractiveGenerator()).generate(q["question"], hits)
            elapsed = (time.perf_counter() - started) * 1000
            metrics = ranking_metrics([h["paper_id"] for h in hits], q["relevant"], k)
            metrics.update(answer_metrics(answer, q.get("answer"), texts))
            records.append(
                {
                    "query_id": q["id"],
                    "question": q["question"],
                    "retrieved": [h["paper_id"] for h in hits],
                    "relevant": q["relevant"],
                    "metrics": metrics,
                    "latency_ms": elapsed,
                    "answer": answer,
                    "generated_tokens": answer.get("generated_tokens"),
                }
            )
        summary = {m: bootstrap([r["metrics"][m] for r in records], seed) for m in ("recall", "mrr", "ndcg")}
        latency = [r["latency_ms"] for r in records]
        rows.append(
            {
                "mode": mode,
                "metrics": summary,
                "latency_ms": {"median": float(np.median(latency)), "p95": float(np.quantile(latency, 0.95))},
                "queries": records,
            }
        )
        configs.append(
            {
                "mode": mode,
                "k": k,
                "rewrite": rewrite,
                "rerank": rerank,
                "representation": "neural" if index.dense_backend else "lexical",
            }
        )
    paired = []
    if len(rows) > 1:
        for other in rows[1:]:
            paired.append(
                {
                    "baseline": rows[0]["mode"],
                    "candidate": other["mode"],
                    "delta_recall": bootstrap(
                        [
                            b["metrics"]["recall"] - a["metrics"]["recall"]
                            for a, b in zip(rows[0]["queries"], other["queries"])
                        ],
                        seed,
                    ),
                }
            )
    return {
        "id": str(uuid.uuid4()),
        "created": created,
        "kind": "retrieval benchmark",
        "dataset": "SciFact demo dev subset",
        "query_count": len(queries),
        "k": k,
        "seed": seed,
        "corpus_sha256": corpus_hash,
        "queries_sha256": hashlib.sha256(json.dumps(queries, sort_keys=True).encode()).hexdigest(),
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "numpy": np.__version__,
            "rss_mb": psutil.Process().memory_info().rss / 2**20,
        },
        "configs": configs,
        "rows": rows,
        "paired": paired,
        "limitations": "Selected dev subset; retrieval scores are not scientific claim verification accuracy. "
        "Citation integrity is not faithfulness. Latency includes retrieval and answer generation; "
        "warm local process, no GPU synchronization. RSS is process snapshot, not peak VRAM.",
    }
