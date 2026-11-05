# Verification record · 2026-11-05

This is an engineering verification report, not a model-quality benchmark. Executed on macOS / Apple Silicon, Python 3.12.14, Node 22.12.0, 18 GiB RAM. Exact package versions are in uv.lock and web/package-lock.json. The committed CPU experiment records its own runtime versions and fingerprints.

| Check | Observed result |
|---|---|
| Core Python tests | 43 passed; two explicit optional integrations skipped by default |
| Explicit native Qwen compatibility test | Passed on a randomly initialized miniature Qwen3.5 configuration; full multimodal-to-text checkpoint load, no missing text weights, forward pass, generation, one adapter optimization step, adapter save/reload and equal logits |
| Embedded Qdrant integration | Passed with actual local Qdrant and deterministic test vectors; no neural quality claim |
| Dashboard interaction tests | 13 passed; original workflows plus notebook editing/execution controls, chart options, model protocol filtering, layout persistence, notebook cell conversion and empirical percentile guides |
| TypeScript + production build | Passed; Plotly remains a separately loaded ~507 kB gzip chart bundle |
| Explicit notebook kernel integration | Passed; persistent variables, real Matplotlib PNG output, saved revisions and kernel cleanup |
| Scientific figure exports | PNG, SVG, PDF and CSV verified from actual reference/run records; exported PNG visually inspected |
| Python static checks | Ruff passed |
| Educational notebooks | All 4 executed successfully, including reference Matplotlib charts and SVG export; no downloads/training |
| Dataset preparation | Verified full SciFact upstream train conversion: 394 train / 52 validation / 59 test examples, paper-connected groups, disjoint partitions, hashed outputs |
| SFT configuration | Dry run validated hashes and split integrity; full checkpoint training not executed |
| Real CPU retrieval experiment | Executed 4 methods over 24 selected dev claims; raw per-query artifact committed |
| Wheel/source distribution | 0.2.0 wheel and source distribution built; wheel inspected for offline demo data, four notebooks and reference experiment |
| Browser end-to-end | Real API query → citations → exact highlighted source; real retrieval benchmark → CIs; dynamic LangGraph execution → seven-node trace; Plotly corpus projection; broad benchmark recipe panel; integrated notebook Run all with real stdout, PNG plots, saved outputs; Plotly/Matplotlib observatory and actual PDF download |
| Responsive layout | Desktop breakpoint and 390 px phone breakpoint inspected; phone document width equals viewport width; mobile navigation exercised |
| Browser console | Final notebook execution and figure workflow completed; development route switches emitted transient React Flow sizing warnings. Graphs were visually inspected after layout; no execution errors in the final notebook workflow. |
| Frontend dependency audit | npm audit reported zero known vulnerabilities after patching the test runner and deduplicating KaTeX |
| Docker | Configuration supplied; image not executed because the local Docker daemon is unavailable |

## Reproduce verification

```bash
uv sync --locked --extra dev
source .venv/bin/activate
pytest -q
ruff check src tests scripts
python scripts/execute_notebooks.py
EVIDENCELAB_TEST_NOTEBOOKS=1 pytest tests/optional/test_notebook_kernel.py -q
npm --prefix web ci
npm --prefix web test
npm --prefix web run build
# Explicit small random-weights architecture check only:
pip install -e '.[models]'
EVIDENCELAB_TEST_MODELS=1 HF_HUB_OFFLINE=1 pytest tests/optional -q
```

Screenshots in `docs/images/` are actual browser captures, not image-generated mockups. The 0.8B and 4B pretrained weights were **not downloaded** during this verification. Full Qwen capability evaluations, neural retrieval quality, SFT/QLoRA, DPO/GRPO and GPU performance remain opt-in and unmeasured here. The random miniature model has no meaningful language capability and contributes no benchmark scores.
