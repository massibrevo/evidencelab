# Architecture decisions

**ADR-001: Offline baseline before model inference.** FastAPI + NumPy lexical retrieval + extractive sentences make the entire provenance/evaluation path runnable without weights. This baseline is a real system to measure against, not a neural placeholder. Heavy imports stay inside explicitly invoked code.

**ADR-002: Originals in SQLite, indexes derived.** SQLite stores paper payloads and completed runs, with WAL and locks. On startup and mutation, indexes rebuild deterministically. Embedded Qdrant is in-memory and disposable. This avoids a mandatory database service and handles small corpora; it is not a high-throughput ingestion architecture. A dedicated indexing worker and persistent Qdrant service are natural next steps for larger collections.

**ADR-003: Exact offsets, transparent source claims.** Chunk IDs hash paper identity, offsets and content. Excerpts retain original character ranges. PDF text includes page markers, but offsets refer to extracted text, not coordinates on the PDF. Links to SciFact point to the dataset because numeric SciFact IDs are not stable public article URLs.

**ADR-004: Measurable graph baseline.** Five hand-curated concept sets create a co-occurrence graph. Graph retrieval expands scores from a top evidence seed. This is inspectable and ablatable, with clear limitations. LLM entity extraction, community detection and community summaries are intentionally not claimed as implemented Microsoft GraphRAG.

**ADR-005: LangGraph for explicit control flow.** Shared typed state, node traces, in-process checkpoints and bounded reflection support controlled topology comparisons. Single, supervisor, hierarchical and rule-routed swarm share retrieval and generation interfaces. The current roles perform source search/inventory/provenance validation; semantic critique requires a separate model or human evaluator.

**ADR-006: Native Qwen text path.** Qwen3.5 multimodal checkpoints require architecture-aware loading. Use `Qwen3_5ForCausalLM`, tokenizer chat templates, local devices, and no remote code. Foundation evaluation passes the preloaded model to the harness's supported HFLM interface. Additional model families can implement the `Generator` protocol; a generic registry is not proof of compatibility with every architecture.

**ADR-007: Explicit compute.** Web endpoints do not spawn training, download arbitrary models or execute code. Optional inference is chosen at server startup; training and broad benchmark execution require terminal commands. Model revisions, dataset hashes, runtime and hyperparameters belong in each artifact.

**ADR-008: React as an instrument panel.** React Flow shows configured or executed paths; Plotly shows computed projections/history. Empty states carry no invented results. The dashboard is served through Vite in development or FastAPI after a build. It uses no external fonts or analytics.

**ADR-009: Small, synchronous local service.** Mutating/index/inference operations are serialized to avoid races over indexes and GPU state. This prioritizes workstation correctness. There is no distributed queue, cancellation API, authentication, multi-tenant isolation or untrusted internet deployment claim.
