"""Observed workstation KPIs and provenance-aware experiment discovery."""

import json
import os
import time
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import psutil

from .service import ROOT


def benchmark_catalog(lab) -> list[dict]:
    runs = [
        {**r, "provenance": "local", "label": f"Local · k={r['k']} · {r['created']}"}
        for r in lab.store.runs("benchmark")
    ]
    reference = ROOT / "docs/experiments/scifact-cpu.json"
    if not reference.exists():
        reference = Path(__file__).parent / "resources/reference.json"
    if reference.exists():
        record = json.loads(reference.read_text())
        if record["id"] not in {r["id"] for r in runs}:
            runs.append(
                {
                    **record,
                    "provenance": "reference",
                    "label": "Published reference · original workstation · k=3",
                }
            )
    return runs


def find_benchmark(lab, identifier: str) -> dict:
    result = next((r for r in benchmark_catalog(lab) if r["id"] == identifier), None)
    if result is None:
        raise ValueError("Benchmark not found")
    return result


def resource_snapshot() -> dict:
    process = psutil.Process()
    memory = psutil.virtual_memory()
    return {
        "timestamp": datetime.now(UTC).isoformat(),
        "rss_mb": process.memory_info().rss / 2**20,
        "system_memory_percent": memory.percent,
        "available_memory_gb": memory.available / 2**30,
        "process_cpu_seconds": sum(process.cpu_times()[:2]),
        "threads": process.num_threads(),
        "uptime_seconds": max(0, time.time() - process.create_time()),
        "logical_cpus": os.cpu_count(),
        "note": "Live process RSS and system memory snapshots; not historical GPU utilization",
    }


def summarize(lab) -> dict:
    # The run browser intentionally bounds inspection to the latest 100 records.
    runs = lab.store.runs()
    questions = [r for r in runs if "answer" in r]
    latencies = [r["latency_ms"] for r in questions if isinstance(r.get("latency_ms"), (int, float))]
    tokens = [r["generated_tokens"] for r in questions if isinstance(r.get("generated_tokens"), int)]
    nodes = defaultdict(list)
    architectures = Counter()
    for r in runs:
        if r.get("architecture"):
            architectures[r["architecture"]] += 1
        for event in r.get("trace", []):
            nodes[event["node"]].append(event["elapsed_ms"])
    counts = lab.store.run_counts()
    return {
        "counts": counts,
        "window_size": len(runs),
        "window_limit": 100,
        "papers": len(lab.store.papers()),
        "chunks": len(lab.index.chunks),
        "answered": sum(not r.get("abstained", False) for r in questions),
        "abstained": sum(bool(r.get("abstained")) for r in questions),
        "cited_answers": sum(bool(r.get("citations")) for r in questions),
        "generated_tokens": sum(tokens) if tokens else None,
        "latency": {"median": float(np.median(latencies)), "p95": float(np.quantile(latencies, 0.95))}
        if latencies
        else None,
        "architectures": dict(architectures),
        "nodes": [
            {"node": name, "calls": len(values), "mean_ms": float(np.mean(values)), "total_ms": sum(values)}
            for name, values in sorted(nodes.items())
        ],
        "activity": [
            {
                "id": r["id"],
                "created": r["created"],
                "kind": "benchmark" if "rows" in r else "investigation" if "trace" in r else "query",
                "label": r.get("question", r.get("dataset", "Experiment")),
                "latency_ms": r.get("latency_ms"),
                "architecture": r.get("architecture"),
            }
            for r in runs[:20]
        ],
        "resources": resource_snapshot(),
        "limitations": "Answer presence, citations and abstention are operational signals, not task success "
        "or semantic faithfulness. Windowed KPIs inspect the latest 100 runs; total counts are unbounded.",
    }
