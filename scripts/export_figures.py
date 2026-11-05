"""Export reproducible scientific figures without launching the web app."""

import argparse
import json
from pathlib import Path

from evidencelab.figures import render_benchmark
from evidencelab.service import ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", type=Path, default=ROOT / "docs/experiments/scifact-cpu.json")
    parser.add_argument("--output", type=Path, default=Path(".evidencelab/figures"))
    parser.add_argument("--chart", choices=["scores", "latency", "heatmap", "tradeoff", "all"], default="all")
    parser.add_argument("--formats", nargs="+", choices=["png", "svg", "pdf"], default=["png", "svg", "pdf"])
    parser.add_argument("--theme", choices=["dark", "paper"], default="paper")
    parser.add_argument("--palette", choices=["spectrum", "ocean", "accessible"], default="accessible")
    parser.add_argument("--metric", choices=["recall", "mrr", "ndcg"], default="recall")
    args = parser.parse_args()
    record = json.loads(args.run.read_text())
    if args.run.resolve() == (ROOT / "docs/experiments/scifact-cpu.json").resolve():
        record["provenance"] = "reference"
    args.output.mkdir(parents=True, exist_ok=True)
    charts = ["scores", "latency", "heatmap", "tradeoff"] if args.chart == "all" else [args.chart]
    for chart in charts:
        for fmt in args.formats:
            file = args.output / f"{chart}-{record['id'][:8]}.{fmt}"
            file.write_bytes(render_benchmark(record, chart, args.metric, fmt, args.theme, args.palette))
            print(file)


if __name__ == "__main__":
    main()
