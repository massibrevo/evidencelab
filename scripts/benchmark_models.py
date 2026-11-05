import argparse
import json
from pathlib import Path

from evidencelab.foundation import SUITES, execute, plan
from evidencelab.models import MODEL_IDS


def main():
    p = argparse.ArgumentParser(description="Plan or explicitly execute broad foundation-model benchmarks")
    p.add_argument("--suite", choices=list(SUITES), default="smoke")
    p.add_argument("--model", choices=list(MODEL_IDS), default="qwen-0.8b")
    p.add_argument("--revision", default="main", help="Use an immutable commit for publishable experiments")
    p.add_argument("--adapter")
    p.add_argument("--limit", type=int, help="Samples per task; omit for full evaluation")
    p.add_argument("--fewshot", type=int)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--thinking", action="store_true")
    p.add_argument("--quantization", choices=["none", "nf4"], default="none")
    p.add_argument("--output", type=Path, default=Path(".evidencelab/foundation/my-run"))
    p.add_argument("--execute", action="store_true", help="Download weights/datasets and run the evaluation")
    a = p.parse_args()
    config = plan(a.suite, a.model, a.limit, a.revision, a.adapter, a.seed, a.fewshot, a.thinking)
    print(json.dumps(execute(config, a.output, a.quantization) if a.execute else config, indent=2))


if __name__ == "__main__":
    main()
