# Verification record · 2026-11-05

This is an engineering verification report, not a model-quality benchmark. Executed on macOS / Apple Silicon, Python 3.12.14, Node 22.12.0, 18 GiB RAM. Exact package versions are in uv.lock and web/package-lock.json. The committed CPU experiment records its own runtime versions and fingerprints.

| Check | Observed result |
|---|---|
| Core Python tests | 31 passed; optional neural architecture test skipped by default |
| Explicit native Qwen compatibility test | Passed on a randomly initialized miniature Qwen3.5 configuration; full multimodal-to-text checkpoint load, no missing text weights, forward pass, generation, one adapter optimization step, adapter save/reload and equal logits |
| Embedded Qdrant integration | Passed with actual local Qdrant and deterministic test vectors; no neural quality claim |
| Dashboard interaction tests | 4 passed; research request, source drawer, honest empty states, filtering, broad-task navigation, command palette |
| TypeScript + production build | Passed |
| Python static checks | Ruff passed |
| Educational notebooks | All 3 executed successfully, no downloads/training |
| Dataset preparation | Verified full SciFact upstream train conversion: 394 train / 52 validation / 59 test examples, paper-connected groups, disjoint partitions, hashed outputs |
| SFT configuration | Dry run validated hashes and split integrity; full checkpoint training not executed |
| Real CPU retrieval experiment | Executed 4 methods over 24 selected dev claims; raw per-query artifact committed |
| Wheel/source distribution | Both built; wheel inspected to confirm all three offline demo resources are packaged |
| Browser end-to-end | Real API query → citations → exact highlighted source; real retrieval benchmark → CIs; dynamic LangGraph execution → seven-node trace; Plotly corpus projection; broad benchmark recipe panel |
| Responsive layout | Desktop breakpoint and 390 px phone breakpoint inspected; phone document width equals viewport width; mobile navigation exercised |
| Browser console | No error/warning records during final inspected workflow |
| Docker | Configuration supplied; image not executed because the local Docker daemon is unavailable |

## Reproduce verification

```bash
uv sync --locked --extra dev
source .venv/bin/activate
pytest -q
ruff check src tests scripts
python scripts/execute_notebooks.py
npm --prefix web ci
npm --prefix web test
npm --prefix web run build
# Explicit small random-weights architecture check only:
pip install -e '.[models]'
EVIDENCELAB_TEST_MODELS=1 HF_HUB_OFFLINE=1 pytest tests/optional -q
```

Screenshots in `docs/images/` are actual browser captures, not image-generated mockups. The 0.8B and 4B pretrained weights were **not downloaded** during this verification. Full Qwen capability evaluations, neural retrieval quality, SFT/QLoRA, DPO/GRPO and GPU performance remain opt-in and unmeasured here. The random miniature model has no meaningful language capability and contributes no benchmark scores.
