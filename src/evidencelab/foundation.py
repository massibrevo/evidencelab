"""Broad capability evaluation using EleutherAI's harness, with explicit execution."""

import hashlib
import importlib.metadata
import json
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from .evaluation import bootstrap
from .models import MODEL_IDS

SUITES = {
    "smoke": {
        "tasks": ["arc_easy", "hellaswag", "gsm8k"],
        "fewshot": 0,
        "description": "Plumbing check only; limited samples are not a leaderboard score",
    },
    "math": {
        "tasks": ["gsm8k", "hendrycks_math"],
        "fewshot": 0,
        "description": "Grade-school arithmetic and competition mathematics",
    },
    "language": {
        "tasks": ["hellaswag", "winogrande", "boolq"],
        "fewshot": 0,
        "description": "Completion plausibility, coreference, and reading comprehension",
    },
    "knowledge": {
        "tasks": ["mmlu"],
        "fewshot": 0,
        "description": "57-subject knowledge; canonical 5-shot is a separate configuration",
    },
    "reasoning": {
        "tasks": ["arc_challenge", "openbookqa"],
        "fewshot": 0,
        "description": "Science question answering and commonsense composition",
    },
    "multilingual": {
        "tasks": ["belebele_eng_Latn", "belebele_ita_Latn", "belebele_spa_Latn"],
        "fewshot": 0,
        "description": "Parallel reading comprehension in English, Italian, Spanish",
    },
    "general": {
        "tasks": ["gsm8k", "hellaswag", "winogrande", "arc_challenge", "mmlu", "boolq"],
        "fewshot": 0,
        "description": "Broad core suite; may take hours, even on a GPU",
    },
}


def plan(
    suite: str,
    model: str = "qwen-0.8b",
    limit: int | None = None,
    revision: str = "main",
    adapter: str | None = None,
    seed: int = 42,
    fewshot: int | None = None,
    thinking: bool = False,
) -> dict:
    if suite not in SUITES or model not in MODEL_IDS:
        raise ValueError("Unknown suite or model")
    if limit is not None and limit < 1:
        raise ValueError("Sample limit must be positive")
    if fewshot is not None and fewshot < 0:
        raise ValueError("fewshot must be nonnegative")
    if suite == "smoke" and limit is None:
        limit = 10
    return {
        "suite": suite,
        "tasks": SUITES[suite]["tasks"],
        "model_id": MODEL_IDS[model],
        "revision": revision,
        "adapter": adapter,
        "limit": limit,
        "seed": seed,
        "fewshot": SUITES[suite]["fewshot"] if fewshot is None else fewshot,
        "thinking": thinking,
        "apply_chat_template": True,
        "max_length": 4096,
        "max_gen_tokens": 512,
        "batch_size": 1,
        "do_sample": False,
        "status": "planned",
        "scope": "smoke / limited" if limit else "full task splits",
        "description": SUITES[suite]["description"],
    }


def execute(config: dict, output: Path, quantization: str = "none") -> dict:
    import torch
    from lm_eval import simple_evaluate
    from lm_eval.models.huggingface import HFLM
    from lm_eval.tasks import TaskManager

    from .models import ModelConfig, TransformersGenerator

    if output.exists() and any(output.iterdir()):
        raise ValueError("Choose a fresh output directory; previous evaluations are immutable")
    output.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    generator = TransformersGenerator(
        ModelConfig(
            model_id=config["model_id"],
            revision=config["revision"],
            adapter=config["adapter"],
            quantization=quantization,
        )
    )
    lm = HFLM(
        pretrained=generator.model,
        tokenizer=generator.tokenizer,
        backend="causal",
        batch_size=1,
        max_length=config["max_length"],
        enable_thinking=config["thinking"],
        think_end_token="</think>",
    )
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()
    results = simple_evaluate(
        model=lm,
        tasks=config["tasks"],
        task_manager=TaskManager(),
        num_fewshot=config["fewshot"],
        limit=config["limit"],
        batch_size=1,
        log_samples=True,
        apply_chat_template=config["apply_chat_template"],
        fewshot_as_multiturn=False,
        random_seed=config["seed"],
        numpy_random_seed=config["seed"],
        torch_random_seed=config["seed"],
        fewshot_random_seed=config["seed"],
        bootstrap_iters=2000,
        gen_kwargs={"do_sample": False, "max_gen_toks": 512},
    )
    if results is None:
        raise RuntimeError("Harness returned no results")
    if torch.cuda.is_available():
        torch.cuda.synchronize()
    elapsed = time.perf_counter() - started
    rows = []
    for task, metrics in results["results"].items():
        samples = results.get("samples", {}).get(task, [])
        for metric, score in metrics.items():
            if "," not in metric or "stderr" in metric or not isinstance(score, (float, int)):
                continue
            key = metric.split(",")[0]
            values = [s[key] for s in samples if isinstance(s.get(key), (float, int))]
            rows.append(
                {
                    "task": task,
                    "metric": metric,
                    "score": score,
                    "stderr": metrics.get(metric.replace(",", "_stderr,", 1)),
                    "ci": bootstrap(values, config["seed"]) if values else None,
                    "n": len(samples),
                }
            )
    resolved = getattr(generator.model.config, "_commit_hash", None)
    adapter_sha256 = None
    if config.get("adapter"):
        adapter_dir = Path(config["adapter"])
        digest = hashlib.sha256()
        for path in sorted(adapter_dir.rglob("*")):
            if path.is_file():
                digest.update(str(path.relative_to(adapter_dir)).encode())
                digest.update(path.read_bytes())
        adapter_sha256 = digest.hexdigest()

    environment = {lib: importlib.metadata.version(lib) for lib in ("torch", "transformers", "lm-eval")}
    artifact = {
        "id": str(uuid.uuid4()),
        "created": datetime.now(UTC).isoformat(),
        "config": {
            **config,
            "status": "completed",
            "resolved_model_commit": resolved,
            "adapter_sha256": adapter_sha256,
            "quantization": quantization,
        },
        "rows": rows,
        "elapsed_seconds": elapsed,
        "environment": environment,
        "peak_vram_gb": torch.cuda.max_memory_allocated() / 2**30 if torch.cuda.is_available() else None,
        "limitations": "Task versions and sample IDs are retained in raw.json. Public benchmarks may be in "
        "pretraining data. Limited runs are not comparable to full published scores. "
        "Per-task query bootstrap CIs do not account for pretraining contamination or subject clustering.",
    }
    raw_path = output / "raw.json"
    raw_path.write_text(json.dumps(results, default=str, indent=2))
    artifact["raw_sha256"] = hashlib.sha256(raw_path.read_bytes()).hexdigest()
    (output / "summary.json").write_text(json.dumps(artifact, indent=2))
    return artifact
