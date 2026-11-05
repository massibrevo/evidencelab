"""Prepare only upstream train data. Training never consumes packaged demo dev claims."""

import argparse
import json
from pathlib import Path

from evidencelab.datasets import qasper_records, save_splits, scifact_records


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dataset", choices=["scifact", "qasper"], required=True)
    p.add_argument("--train-file", type=Path, required=True, help="Original upstream training JSON/JSONL")
    p.add_argument("--corpus", type=Path, help="SciFact corpus.jsonl")
    p.add_argument("--output", type=Path, default=Path("artifacts/splits"))
    p.add_argument("--seed", type=int, default=42)
    a = p.parse_args()
    if "train" not in a.train_file.name.lower() or any(
        s in a.train_file.name.lower() for s in ("dev", "test")
    ):
        p.error("Only upstream training files are accepted; preserve official dev/test for evaluation")
    if a.dataset == "scifact":
        if not a.corpus:
            p.error("SciFact requires --corpus")
        records = scifact_records(
            [json.loads(line) for line in a.corpus.read_text().splitlines() if line],
            [json.loads(line) for line in a.train_file.read_text().splitlines() if line],
        )
    else:
        records = qasper_records(json.loads(a.train_file.read_text()))
    print(json.dumps(save_splits(records, a.output, a.seed, a.dataset), indent=2))


if __name__ == "__main__":
    main()
