"""Opt-in PEFT/TRL SFT. --help and --dry-run never import torch or download models."""

import argparse
import hashlib
import json
import os
import platform
from pathlib import Path

from evidencelab.models import MODEL_IDS


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dataset", type=Path, required=True)
    p.add_argument("--model", choices=list(MODEL_IDS), default="qwen-0.8b")
    p.add_argument("--revision", default="main")
    p.add_argument("--output", type=Path, default=Path(".evidencelab/training/sft"))
    p.add_argument("--quantization", choices=["none", "nf4"], default="none")
    p.add_argument("--epochs", type=float, default=1)
    p.add_argument("--max-steps", type=int, default=-1)
    p.add_argument("--rank", type=int, default=16)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--mlflow", action="store_true")
    p.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    if a.rank < 1 or a.epochs <= 0:
        p.error("Rank and epochs must be positive")
    manifest_path = a.dataset / "manifest.json"
    dataset_manifest = json.loads(manifest_path.read_text())
    if dataset_manifest.get("upstream_split") != "train":
        p.error("Training requires upstream train provenance")
    rows = {}
    for split in ("train", "validation", "test"):
        path = a.dataset / f"{split}.jsonl"
        if hashlib.sha256(path.read_bytes()).hexdigest() != dataset_manifest["sha256"][split]:
            p.error(f"{split} data differs from its preparation manifest")
        rows[split] = [json.loads(line) for line in path.read_text().splitlines() if line]
    groups = {s: {pid for r in rs for pid in r["paper_ids"]} for s, rs in rows.items()}
    if any(
        groups[x] & groups[y] for x, y in (("train", "validation"), ("train", "test"), ("validation", "test"))
    ):
        p.error("Paper leakage across splits")
    config = {
        "model_id": MODEL_IDS[a.model],
        "revision": a.revision,
        "quantization": a.quantization,
        "seed": a.seed,
        "rank": a.rank,
        "alpha": a.rank * 2,
        "learning_rate": 2e-4,
        "max_length": 1024,
        "epochs": a.epochs,
        "dataset": dataset_manifest,
    }
    if a.dry_run:
        print(json.dumps(config, indent=2))
        return
    import torch
    from datasets import Dataset
    from peft import LoraConfig, prepare_model_for_kbit_training
    from transformers import AutoTokenizer, BitsAndBytesConfig, Qwen3_5ForCausalLM, TrainerCallback, set_seed
    from trl import SFTConfig, SFTTrainer

    set_seed(a.seed)
    cuda = torch.cuda.is_available()
    mps = torch.backends.mps.is_available()
    if a.quantization == "nf4" and not cuda:
        p.error("NF4 QLoRA requires CUDA. Use unquantized LoRA on MPS.")
    if a.output.exists() and any(a.output.iterdir()):
        p.error("Output is not empty; choose a new run directory to preserve artifacts")
    a.output.mkdir(parents=True, exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_IDS[a.model], revision=a.revision, trust_remote_code=False
    )
    tokenizer.pad_token = tokenizer.eos_token
    dtype = (
        torch.bfloat16 if cuda and torch.cuda.is_bf16_supported() else torch.float16 if mps else torch.float32
    )
    kwargs = {"revision": a.revision, "dtype": dtype, "trust_remote_code": False}
    if a.quantization == "nf4":
        kwargs.update(
            quantization_config=BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
                bnb_4bit_compute_dtype=dtype,
            ),
            device_map={"": 0},
        )
    model = Qwen3_5ForCausalLM.from_pretrained(MODEL_IDS[a.model], **kwargs)
    if a.quantization == "nf4":
        model = prepare_model_for_kbit_training(model)
    model.config.use_cache = False
    config["resolved_model_commit"] = getattr(model.config, "_commit_hash", None)
    config["python"] = platform.python_version()
    config["torch"] = torch.__version__
    config["device"] = "cuda" if cuda else "mps" if mps else "cpu"
    config["max_steps"] = a.max_steps
    config["status"] = "running"
    history = []

    class LogHistory(TrainerCallback):
        def on_log(self, args, state, control, logs=None, **kwargs):
            history.append({"step": state.global_step, **(logs or {})})
            (a.output / "history.json").write_text(json.dumps(history, indent=2))

    # Explicit projections supported by attention AND DeltaNet paths where present.
    targets = [
        name
        for name in ("q_proj", "k_proj", "v_proj", "o_proj", "in_proj_qkv", "out_proj")
        if any(n.endswith("." + name) for n, _ in model.named_modules())
    ]
    if not targets:
        raise ValueError("No recognized adapter targets. Inspect this model architecture.")
    config["target_modules"] = targets
    manifest = a.output / "manifest.json"
    manifest.write_text(json.dumps(config, indent=2))
    report_to = []
    if a.mlflow:
        import mlflow

        mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "sqlite:///mlflow.db"))
        mlflow.set_experiment("EvidenceLab-SFT")
        report_to = ["mlflow"]
    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=Dataset.from_list(rows["train"]),
        eval_dataset=Dataset.from_list(rows["validation"]),
        peft_config=LoraConfig(
            r=a.rank, lora_alpha=a.rank * 2, lora_dropout=0.05, target_modules=targets, task_type="CAUSAL_LM"
        ),
        callbacks=[LogHistory()],
        args=SFTConfig(
            output_dir=str(a.output),
            num_train_epochs=a.epochs,
            max_steps=a.max_steps,
            per_device_train_batch_size=1,
            per_device_eval_batch_size=1,
            gradient_accumulation_steps=8,
            learning_rate=2e-4,
            max_length=1024,
            eval_strategy="steps",
            eval_steps=25,
            logging_steps=1,
            save_steps=50,
            seed=a.seed,
            data_seed=a.seed,
            bf16=dtype == torch.bfloat16,
            fp16=dtype == torch.float16 and cuda,
            report_to=report_to,
            run_name=a.output.name,
            gradient_checkpointing=True,
            gradient_checkpointing_kwargs={"use_reentrant": False},
            completion_only_loss=True,
            packing=False,
        ),
    )
    try:
        trainer.train()
        trainer.evaluate()
        trainer.save_model(str(a.output / "adapter"))
        tokenizer.save_pretrained(a.output / "adapter")
        config["status"] = "completed"
    except Exception:
        config["status"] = "failed"
        raise
    finally:
        manifest.write_text(json.dumps(config, indent=2))
        (a.output / "history.json").write_text(json.dumps(trainer.state.log_history, indent=2))


if __name__ == "__main__":
    main()
