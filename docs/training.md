# Optional training and model evaluation

The offline demo performs no training. Install only what the experiment needs. Apple Silicon: unquantized LoRA with MPS where model operators support it. NVIDIA: bf16 when supported, optional CUDA NF4 with bitsandbytes. No claim that the 4B model fits every device or context size.

## Prepare data

```bash
python scripts/download_scifact.py
python scripts/prepare.py --dataset scifact \
  --train-file data/downloads/scifact/claims_train.jsonl \
  --corpus data/downloads/scifact/corpus.jsonl --output artifacts/splits
```

`prepare.py` converts training claims into evidence-conditioned SUPPORT/CONTRADICT examples. It excludes claims with no evidence or conflicting evidence labels. The full evidence context includes only labeled evidence papers: this is an **oracle-context classification training objective**, not open-corpus retrieval supervision. Test generalization separately with retrieved contexts. It does not train citation generation.

For QASPER, obtain original upstream train JSON from the [official source](https://huggingface.co/datasets/allenai/qasper), then:

```bash
python scripts/prepare.py --dataset qasper --train-file data/downloads/qasper-train.json --output artifacts/qasper-splits
```

Answer variants remain in their paper group. For long papers, inspect token truncation; the 1,024-token SFT cap may discard evidence and create a poor objective. Before a real study, use question-conditioned windows and manually audit retained answer support. Do not report results from this recipe as faithful long-document SFT without that audit.

## SFT

```bash
pip install -e '.[train]'
python scripts/train.py --dataset artifacts/splits --dry-run
python scripts/train.py --dataset artifacts/splits --model qwen-0.8b \
  --max-steps 10 --output .evidencelab/training/smoke
# Local MLflow integration:
python scripts/train.py --dataset artifacts/splits --model qwen-4b \
  --mlflow --output .evidencelab/training/lora-4b
# CUDA only:
pip install -e '.[qlora]'
python scripts/train.py --dataset artifacts/splits --model qwen-4b \
  --quantization nf4 --output .evidencelab/training/qlora-4b
```

The trainer checks file hashes, paper separation and upstream train provenance. It trains completion tokens, saves adapters/tokenizer, a manifest with resolved model revision, and actual trainer history. The dashboard reads `.evidencelab/training/*/{history,manifest}.json`. Set `EVIDENCELAB_HOME` consistently or pass an output under your configured home. Compare validation loss at matched optimizer steps; training loss alone is not a quality metric. The held-out prepared test split is never passed to the trainer.

```bash
EVIDENCELAB_MODEL=qwen-0.8b EVIDENCELAB_ADAPTER=.evidencelab/training/smoke/adapter ./scripts/dev.sh
```

## Preference and RL recipes

```bash
python scripts/preferences.py --method dpo --data artifacts/preferences-train.jsonl
python scripts/preferences.py --method dpo --data artifacts/preferences-train.jsonl --execute
python scripts/preferences.py --method grpo --data artifacts/rewards-train.jsonl --execute
```

DPO expects `prompt`, `chosen`, `rejected` records, preferably conversational fields. GRPO expects prompt plus independently verified `label` of SUPPORT or CONTRADICT. Labels are for the reward function, never inserted into the prompt by the recipe. Do not use dev/test gold to train a reward. The classification reward is an educational experiment; sparse rewards can collapse, and a formatting reward alone is insufficient for science. These optional recipes are not part of the tested CPU path. Before extended runs, validate installed TRL API, memory, tokenizer padding and reward distributions with a tiny job.

## Broad model benchmarks

```bash
pip install -e '.[benchmark]'
# Planning only, no model import or downloads:
python scripts/benchmark_models.py --suite general --model qwen-0.8b
# Explicit limited inference (weights + datasets downloaded):
python scripts/benchmark_models.py --suite smoke --model qwen-0.8b \
  --output .evidencelab/foundation/08b-smoke --execute
# Full selected math tasks, no sample limit:
python scripts/benchmark_models.py --suite math --model qwen-4b \
  --output .evidencelab/foundation/4b-math --execute
# Matched adapter comparison:
python scripts/benchmark_models.py --suite math --model qwen-4b \
  --adapter artifacts/my-adapter --output .evidencelab/foundation/4b-adapter-math --execute
# More suites: language, knowledge, reasoning, multilingual, general
```

`smoke` defaults to ten items per task. Other suites default to full task splits; use `--limit 10` for a limited check. Full general/MMLU/MATH runs can take hours. For stable publication use `--revision COMMIT_SHA`, a fresh output directory, identical seeds and sample limits. Both 4B and 0.8B use the native Qwen3.5 text loader. The dashboard reads finished `foundation/*/summary.json` files; raw harness output includes task and sample provenance. No GPU benchmark has been executed or claimed by the included CPU demo.
