# EvidenceLab contributor / agent contract

- Use Python 3.12+, type annotations, Pydantic boundaries, and explicit imports for optional libraries. Keep the CPU path free of PyTorch imports.
- Read README.md, docs/architecture.md and docs/methodology.md before changing retrieval, citations or metrics.
- Never invent benchmark results, training history, citations, hardware measurements or public URLs. Store real experiment provenance and label smoke results.
- Citation offsets must reproduce exact slices of original extracted paper text. A source ID check is not semantic faithfulness.
- Do not download model weights, train or run broad model suites as part of ordinary tests. These are explicit opt-in workflows. Test core behavior with small deterministic data.
- Keep original upstream train/dev/test boundaries; prevent paper-level connected-component leakage. Never train on the packaged SciFact dev claims.
- Do not silently fall back from requested neural functionality to lexical retrieval. Return an actionable error when an optional feature is unavailable.
- Run `pytest`, `ruff check src tests scripts`, `npm --prefix web test` and `npm --prefix web run build` for corresponding changes. Exercise API/UI state changes, empty states and errors.
- Prefer accessible native controls, local assets and honest labels. Configured graphs are labeled as templates; executed traces come from real runs.
- Preserve local-first defaults, bound file inputs, reject arbitrary fetch URLs, avoid remote code, and never expose credentials in artifacts.
- Keep implementation status and research limitations current. New model families need an explicit adapter and compatibility evidence.

- Notebook execution is a trusted-local opt-in (`scripts/dev.sh --notebooks`). Never execute imported cells automatically. Keep revision conflicts, output limits, timeouts, and kernel cleanup intact. Use `EVIDENCELAB_TEST_NOTEBOOKS=1 pytest tests/optional/test_notebook_kernel.py` only for an explicitly requested local-kernel check.
