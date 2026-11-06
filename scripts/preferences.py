"""Optional DPO/GRPO recipes: explicit execution, supplied labels, never synthetic benchmark results."""

import argparse
import json
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--method", choices=["dpo", "grpo"], required=True)
    p.add_argument(
        "--data",
        type=Path,
        required=True,
        help="Train-only JSONL; DPO: prompt/chosen/rejected; GRPO: prompt/label",
    )
    p.add_argument("--model", default="Qwen/Qwen3.5-0.8B")
    p.add_argument("--revision", default="main", help="Prefer an immutable Hugging Face commit for training")
    p.add_argument("--output", default="artifacts/preferences")
    p.add_argument("--execute", action="store_true", help="Download model and start training")
    a = p.parse_args()
    records = [json.loads(line) for line in a.data.read_text().splitlines() if line]
    keys = {"prompt", "chosen", "rejected"} if a.method == "dpo" else {"prompt", "label"}
    if not records or any(not keys <= r.keys() for r in records):
        p.error(f"Required fields: {sorted(keys)}")
    if a.method == "grpo" and any(r["label"] not in {"SUPPORT", "CONTRADICT"} for r in records):
        p.error("GRPO reward requires independently verified SUPPORT / CONTRADICT labels")
    if not a.execute:
        print(
            json.dumps({"status": "validated recipe; not executed", "method": a.method, "rows": len(records)})
        )
        return
    from datasets import Dataset
    from peft import LoraConfig
    from transformers import AutoTokenizer, Qwen3_5ForCausalLM
    from trl import DPOConfig, DPOTrainer, GRPOConfig, GRPOTrainer

    tokenizer = AutoTokenizer.from_pretrained(a.model, revision=a.revision, trust_remote_code=False)
    tokenizer.pad_token = tokenizer.eos_token
    model = Qwen3_5ForCausalLM.from_pretrained(
        a.model, revision=a.revision, trust_remote_code=False, use_safetensors=True
    )
    peft = LoraConfig(r=8, lora_alpha=16, target_modules=["q_proj", "v_proj"], task_type="CAUSAL_LM")
    dataset = Dataset.from_list(records)
    common = dict(
        output_dir=a.output,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        num_train_epochs=1,
        report_to=[],
        seed=42,
    )
    if a.method == "dpo":
        trainer = DPOTrainer(
            model=model,
            ref_model=None,
            processing_class=tokenizer,
            peft_config=peft,
            train_dataset=dataset,
            args=DPOConfig(**common, beta=0.1, max_length=1024),
        )
    else:

        def reward(completions, label, **kwargs):
            texts = [c[0]["content"] if isinstance(c, list) else c for c in completions]
            return [float(text.strip() == gold) for text, gold in zip(texts, label)]

        # 4 generations require an effective generation batch divisible by four.
        trainer = GRPOTrainer(
            model=model,
            processing_class=tokenizer,
            peft_config=peft,
            train_dataset=dataset,
            reward_funcs=reward,
            args=GRPOConfig(
                **common,
                num_generations=4,
                max_completion_length=64,
                max_prompt_length=1024,
                use_vllm=False,
                beta=0.04,
            ),
        )
    trainer.train()
    trainer.save_model(a.output)
    tokenizer.save_pretrained(a.output)


if __name__ == "__main__":
    main()
