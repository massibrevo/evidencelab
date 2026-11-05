import argparse
import json


def main() -> None:
    parser = argparse.ArgumentParser(prog="evidencelab")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("serve")
    hw = sub.add_parser("hardware")
    hw.add_argument("--probe", action="store_true")
    ask = sub.add_parser("ask")
    ask.add_argument("question")
    ask.add_argument("--mode", choices=["bm25", "tfidf", "hybrid", "dense", "graph"], default="hybrid")
    agent = sub.add_parser("investigate")
    agent.add_argument("question")
    agent.add_argument(
        "--architecture", choices=["single", "supervisor", "hierarchical", "swarm"], default="supervisor"
    )
    bench = sub.add_parser("benchmark")
    bench.add_argument("--k", type=int, default=3)
    bench.add_argument("--seed", type=int, default=42)
    bench.add_argument("--rewrite", action="store_true")
    bench.add_argument("--rerank", action="store_true")
    bench.add_argument("--modes", nargs="+", default=["bm25", "tfidf", "hybrid"])
    bench.add_argument("--architecture", choices=["single", "supervisor", "hierarchical", "swarm"])
    args = parser.parse_args()
    if args.command == "serve":
        import uvicorn

        uvicorn.run("evidencelab.api:create_app", factory=True, host="127.0.0.1", port=8000)
        return
    if args.command == "hardware":
        from .models import hardware

        print(json.dumps(hardware(args.probe), indent=2))
        return
    from .service import Lab

    lab = Lab()
    if args.command == "ask":
        from .schema import Query

        result = lab.ask(Query(question=args.question, mode=args.mode))
    elif args.command == "investigate":
        result = lab.agents.investigate(args.question, args.architecture)
        lab.store.save_run(result, "investigation")
    else:
        if args.k < 1:
            parser.error("k must be positive")
        runner = None
        if args.architecture:

            def runner(question, mode):
                return lab.agents.investigate(
                    question, args.architecture, mode, args.k, rewrite=args.rewrite, rerank=args.rerank
                )

        result = lab.benchmark(
            args.modes,
            args.k,
            args.seed,
            runner=runner,
            rewrite=args.rewrite,
            rerank=args.rerank,
            architecture_label=args.architecture,
        )
    print(json.dumps(result, indent=2))
    lab.store.close()
