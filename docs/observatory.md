# Experiment observatory and scientific figures

The observatory combines benchmark artifacts, operational activity and live resource snapshots. It distinguishes local SQLite records from the committed CPU reference. Browsing the reference does not add a local run or inflate local counters.

## Benchmark lenses

- **Score + CI:** grouped Recall@k, MRR@k and nDCG@k bars, using recorded asymmetric 95% bootstrap intervals.
- **Latency:** actual per-query distributions, individual samples and median/quartile summaries.
- **Failures:** a paper-retrieval metric heatmap aligned by query ID across strategies.
- **Trade-offs:** measured median latency against a selected quality metric, with quality intervals where available.

Switch between interactive Plotly and headless Matplotlib. Choose a palette, metric, paper/dark figure background, confidence bars, or a logarithmic latency axis. Export Matplotlib PNG (180 dpi), SVG or PDF, plus raw JSON and tidy per-query CSV. The figures identify run ID, corpus fingerprint, sample size, k, seed and reference/local provenance. No global model intelligence score is inferred.

```bash
python scripts/export_figures.py --chart scores --formats png svg pdf
python scripts/export_figures.py --run .evidencelab/benchmark-RUN_ID.json \
  --chart all --theme paper --palette accessible --output artifacts/figures
```

The API exposes `/api/experiments`, `/api/experiments/{id}/figure` and `/api/experiments/{id}/csv`. Matplotlib runs with a headless backend and serialized access. A 24-entry in-memory export cache avoids regenerating identical figures; edited run data change the cache fingerprint.

## Operational KPIs

Total counts query SQLite directly. Windowed operational measures inspect the latest 100 records and say so. Cited-answer counts represent citation presence; they do not establish entailment or correctness. Generated token counts remain unavailable for the extractive engine rather than being estimated from words.

The resource monitor samples actual process RSS and system memory every four seconds while the page is open, retains at most 60 samples, and can be paused. It does not invent historical telemetry or report CPU/GPU utilization that was not sampled. Agent work distribution aggregates measured node durations from saved LangGraph traces.

## Experiment controls

The retrieval benchmark panel supports strategy selection, k, seed, query expansion, optional neural reranking, 500–10,000 bootstrap resamples and single/supervisor/hierarchical/dynamic agent workflows. Missing neural dependencies stay explicit. Each run records the selected configuration and architecture.

The foundation-model panel can plot compatible recorded task scores as grouped bars or dots. Only matching suite, sample limit, few-shot count, seed, thinking, quantization and context budget are overlaid; incompatible runs remain available in raw result tables. Missing intervals are not invented. Task versions, datasets and prompt configuration must still be checked in the raw harness artifacts before making a publication claim.

## Visual workspace

Aurora, Ocean, Mint and Ember themes are available in the top bar, with comfortable and compact layouts. Settings persist in browser-local storage. CodeMirror, KaTeX fonts, Plotly and all visual assets are bundled locally. The vector explorer also exposes a filterable concept co-occurrence map; it is explicitly heuristic rather than a learned GraphRAG knowledge graph.
