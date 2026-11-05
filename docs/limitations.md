# Known limitations and honest scope

- The implemented offline answer engine selects excerpts. It does not reason, prove entailment, or automatically resolve contradictory scientific findings.
- Full Qwen3.5 inference, QLoRA, DPO/GRPO, neural reranking and full foundation benchmarks require optional dependencies and have not been run in the CPU verification report. Version resolution is not equivalent to hardware execution.
- Concept expansion is not a reproduction of GraphRAG. Rule-based reflection is not trained Self-RAG. Offset integrity is not RAGChecker faithfulness. Rule-routed workflows are not an emergent decentralized swarm.
- Broad task suites are executable integrations with the official harness, not already measured scores. Coding generation/execution, vision evaluation, conversational style quality, and universal multilingual proficiency are outside the present benchmark suite.
- PDF extraction supports text PDFs, bounded to 20 MiB and 200 pages. No OCR, equation reconstruction, figure understanding, or reliable table extraction. Read the original paper when formatting matters.
- Ingestion is synchronous; a large local PDF can block a worker. The service is designed for trusted single-user localhost use. No production authentication, quotas or multi-tenant deployment is implied.
- The demo excludes evidence-free SciFact claims, uses a small selected dev corpus, and has no held-out quality score. It cannot establish generalization or absence of hallucination.
- Statistical intervals quantify query sampling variability only. Paper clustering, benchmark contamination and repeated researcher decisions can invalidate stronger interpretations.
- Fine-tuning uses an oracle-context classification objective for SciFact. Long QASPER contexts need a supervised windowing audit before useful training. Training recipes are educational implementations, not optimized model-quality claims.
- Checkpoint memory is in-process and limited to the ten most recent source inventories. Completed runs persist in SQLite. Cross-process semantic memory is not implemented.
- UMAP and topic labels aid inspection, not ground-truth clustering. PCA on TF-IDF is explicitly labeled.
- Resource logging includes warm wall time, process RSS snapshots and optional peak CUDA allocated memory. It does not provide sampled GPU utilization or energy consumption.
