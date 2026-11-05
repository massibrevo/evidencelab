"""Paper-disjoint preparation, including connected components for multi-paper claims."""

import hashlib
import json
import random
from pathlib import Path


def grouped_split(records: list[dict], seed: int = 42, fractions=(0.8, 0.1, 0.1)) -> dict[str, list[dict]]:
    if abs(sum(fractions) - 1) > 1e-9 or any(x <= 0 for x in fractions):
        raise ValueError("Three positive fractions must sum to one")
    if len(fractions) != 3 or len({r["id"] for r in records}) != len(records):
        raise ValueError("Require three fractions and unique record IDs")
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    for r in records:
        if not r.get("paper_ids"):
            raise ValueError("Each record needs nonempty paper_ids for leakage prevention")
        ids = [str(x) for x in r["paper_ids"]]
        for p in ids[1:]:
            parent[find(p)] = find(ids[0])
        find(ids[0])
    groups = {}
    for r in records:
        groups.setdefault(find(str(r["paper_ids"][0])), []).append(r)
    keys = sorted(groups)
    random.Random(seed).shuffle(keys)
    if len(keys) < 3:
        raise ValueError("Need at least three disjoint paper groups")
    # Allocate groups, never split a connected paper component. Row fractions are approximate.
    first = max(1, min(len(keys) - 2, int(len(keys) * fractions[0])))
    second = max(first + 1, min(len(keys) - 1, int(len(keys) * (fractions[0] + fractions[1]))))
    return {
        name: [r for key in selected for r in groups[key]]
        for name, selected in zip(
            ("train", "validation", "test"), (keys[:first], keys[first:second], keys[second:])
        )
    }


def save_splits(records: list[dict], output: Path, seed: int = 42, source: str = "user") -> dict:
    splits = grouped_split(records, seed)
    output.mkdir(parents=True, exist_ok=True)
    manifest = {
        "seed": seed,
        "source": source,
        "grouping": "connected components of shared paper IDs",
        "upstream_split": "train",
        "counts": {},
        "sha256": {},
    }
    for name, rows in splits.items():
        path = output / f"{name}.jsonl"
        path.write_text("\n".join(json.dumps(r) for r in rows) + "\n")
        manifest["counts"][name] = len(rows)
        manifest["sha256"][name] = hashlib.sha256(path.read_bytes()).hexdigest()
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def scifact_records(corpus: list[dict], claims: list[dict]) -> list[dict]:
    papers = {str(p["doc_id"]): p for p in corpus}
    result = []
    for c in claims:
        if not c.get("evidence"):
            continue
        ids = sorted(c["evidence"])
        labels = {e["label"] for values in c["evidence"].values() for e in values}
        if len(labels) != 1:
            continue
        label = next(iter(labels))
        context = "\n\n".join(
            f"[{i + 1}] {papers[pid]['title']}\n" + " ".join(papers[pid]["abstract"])
            for i, pid in enumerate(ids)
        )
        prompt = f"Classify this claim as SUPPORT or CONTRADICT using only the sources.\nClaim: {c['claim']}\n{context}"
        result.append(
            {
                "id": str(c["id"]),
                "paper_ids": ids,
                "label": label,
                "prompt": [{"role": "user", "content": prompt}],
                "completion": [{"role": "assistant", "content": label}],
            }
        )
    return result


def qasper_records(data: dict) -> list[dict]:
    records = []
    for pid, paper in data.items():
        context = "\n\n".join(
            s["section_name"] + "\n" + "\n".join(s["paragraphs"]) for s in paper.get("full_text", [])
        )
        for qa in paper.get("qas", []):
            for i, a in enumerate(qa.get("answers", [])):
                a = a["answer"]
                if a.get("unanswerable"):
                    answer = "Insufficient evidence."
                elif a.get("yes_no") is not None:
                    answer = "Yes" if a["yes_no"] else "No"
                else:
                    answer = a.get("free_form_answer") or "; ".join(a.get("extractive_spans", []))
                if answer:
                    records.append(
                        {
                            "id": f"{qa['question_id']}-{i}",
                            "paper_ids": [pid],
                            "prompt": [{"role": "user", "content": qa["question"] + "\n\n" + context}],
                            "completion": [{"role": "assistant", "content": answer}],
                        }
                    )
    return records
