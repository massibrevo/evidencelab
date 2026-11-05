# Experimental methodology

## Questions before systems

1. Does neural retrieval improve paper recall over BM25 on held-out scientific claims?
2. Does reranking improve top-ranked evidence without an unacceptable latency increase?
3. Does an adapter improve independently annotated answer correctness, and does it degrade broad math/language capabilities?
4. Does a richer agent topology improve task completion after accounting for extra model calls?

These are hypotheses, not reported outcomes. `docs/demo-results.md` records the executed CPU smoke evaluation; optional model/training experiments have no invented scores.

## Dataset protocol

The offline dataset is a deterministic 24-claim SciFact **dev subset**, with all gold evidence papers plus 80 shuffled distractors (108 papers total). Sampling uses Python `random.Random(42)` and upstream archive SHA-256. Subset files have their own checksums. Selection excludes claims without annotated evidence; therefore it cannot estimate unanswerable-claim performance. A smaller corpus makes retrieval easier than full SciFact.

Use `scripts/download_scifact.py` for verified original data. Train only on official `claims_train.jsonl`; split its paper graph into connected components before allocating train/validation/test. Multi-paper claims join all their paper IDs into one component, preventing transitive leakage. Fractions approximate 80/10/10 by **component**, not exact row counts. Preserve official dev/test for external evaluation; official SciFact test labels are not public. QASPER conversion uses original train records and keeps every answer variant in its paper's group.

## Retrieval measurements

Rank at the paper level after chunk scoring. Duplicate chunks from one paper cannot count multiple times. Binary relevance comes from SciFact evidence document IDs; no graded judgments are inferred.

- Recall@k = relevant retrieved papers / all relevant papers.
- MRR@k = reciprocal rank of first relevant paper within k, or 0.
- nDCG@k = binary discounted cumulative gain / ideal gain at k.
- Per-query latency includes retrieval plus answer generation in the same warm process. Report median and p95. Separate index/model startup time when evaluating a deployment.
- Process RSS is a snapshot, not peak memory or GPU utilization. Model harness records peak CUDA allocated memory when available. No estimated token count is presented as a tokenizer count.

The lexical baseline uses sublinear TF-IDF with L2 normalization and BM25 (k1=1.5, b=.75). Hybrid RRF sums `1/(60 + rank)` for each list. With the neural option off it fuses **two lexical methods**. With it on, neural retrieval replaces the TF-IDF rank list. Graph expansion adds fixed concept co-occurrence scores; compare separately and label it as heuristic.

## Generation and agency

Source-integrity checks verify literal offsets. They do not establish whether the sentence supports, refutes, or fails to address the question. Answer exact match and token F1 need reference answers and are named as lexical measures. Accuracy, faithfulness, hallucination rate and task success remain `null` unless independent annotation is supplied. Retain generated answers and task milestones for blinded human assessment. Use at least two annotators, report agreement and adjudication rules, and separate uncertainty from disagreement.

The demo uses deterministic extractive generation, so a source-linked answer can still be irrelevant or misleading. LangGraph nodes call explicit tools; the current planner/router/reflector use rules. The literature node inventories sources, and the verifier checks provenance. Neither silently substitutes for semantic analysis or scientific fact-checking.

For base/adapted comparisons use the same evidence, question IDs, context budget, decoding and tokenizer. Freeze the base checkpoint revision, adapter checksum, dataset hashes and prompt template. To compare agents use `evidencelab benchmark --architecture single` and repeat for the other architectures on identical settings. Checkpoints carry bounded source-history memory between calls in one server process; restart resets checkpoints, while SQLite retains completed investigations.

## Uncertainty and ablations

Bootstrap 2,000 query-level resamples with replacement and seed 42; report the 2.5th and 97.5th percentiles. Paired comparisons resample the **difference for each matching query**, preserving correlation. CIs on the 24-query subset are wide and can be degenerate. They estimate sampling variability within the selected distribution, not the effect of corpus selection, pretraining contamination or annotation errors.

Ablations change one intervention at a time: rewrite on/off, reranking on/off, lexical/neural fusion, graph expansion, topology. The CLI supports `--rewrite`, `--rerank`, `--modes`, and `--architecture`. Compare paired deltas on the same query hash. Repeated architecture or prompt searches create a multiple-comparison problem: preregister the main contrast or reserve a final untouched test set. Bootstrap alone does not establish causality.

## Broad foundation capabilities

`scripts/benchmark_models.py` executes standard harness tasks on the native Qwen text model. Math: GSM8K/MATH; language: HellaSwag, WinoGrande, BoolQ; reasoning: ARC-Challenge/OpenBookQA; knowledge: MMLU; multilingual: selected Belebele languages. No generated code is executed. No model-as-judge or paid API is required.

Default is zero-shot, greedy generation, chat template, thinking disabled, max context 4,096 and generation cap 512. These are explicit **local protocols**, not official Qwen model-card reproductions. A `--limit` evaluation is a smoke sample and not a publishable full score. MMLU group results must be kept separate from per-subject metrics. Public benchmark contamination is unknown. Run adapters through both domain tasks and broad capabilities to detect regressions; do not average unrelated metrics into an arbitrary scalar.

Retain the harness raw results including task versions, sample IDs, prompts, seeds and per-sample metrics. Summary CIs are calculated where numeric per-sample metrics are available; aggregate-only metrics have no invented CI. Use full matched sample records for statistical claims. A valid result report includes model commit, harness version, task versions, dtype/quantization, few-shot count, thinking setting, adapter identity, device, sample limit and truncation policy.
