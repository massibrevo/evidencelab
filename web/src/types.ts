export type Paper = {
  id: string;
  title: string;
  source: string;
  year?: number;
  license: string;
  dataset: string;
  characters: number;
  text?: string;
};
export type Evidence = {
  id: string;
  paper_id: string;
  title: string;
  text: string;
  start: number;
  end: number;
  score: number;
  bm25: number;
  tfidf: number;
  dense: number | null;
  source: string;
};
export type Citation = {
  number: number;
  paper_id: string;
  chunk_id: string;
  title: string;
  quote: string;
  start: number;
  end: number;
  source: string;
};
export type Trace = {
  node: string;
  elapsed_ms: number;
  evidence_count: number;
  tool: string;
  detail: unknown;
};
export type Answer = {
  id: string;
  created: string;
  question: string;
  answer: string;
  citations: Citation[];
  evidence: Evidence[];
  abstained: boolean;
  latency_ms?: number;
  engine?: string;
  trace?: Trace[];
  architecture?: string;
  generated_tokens?: number | null;
};
export type Point = {
  id: string;
  paper_id: string;
  title: string;
  x: number;
  y: number;
  group: string;
};
export type Projection = {
  method: string;
  representation: string;
  points: Point[];
};
export type CI = { mean: number; low: number; high: number; n: number };
export type BenchRow = {
  mode: string;
  metrics: { recall: CI; mrr: CI; ndcg: CI };
  latency_ms: { median: number; p95: number };
  queries: {
    query_id: string;
    question: string;
    retrieved: string[];
    relevant: string[];
    metrics: Record<string, number | null>;
    latency_ms: number;
  }[];
};
export type Benchmark = {
  id: string;
  created: string;
  dataset: string;
  query_count: number;
  k: number;
  rows: BenchRow[];
  seed: number;
  corpus_sha256: string;
  paired: { baseline: string; candidate: string; delta_recall: CI }[];
  limitations: string;
};
export type Overview = {
  papers: number;
  chunks: number;
  runs: number;
  engine: string;
  dense: boolean;
  hardware: {
    platform: string;
    machine: string;
    ram_gb: number;
    device: string;
    note?: string;
  };
  dataset: {
    name: string;
    documents: number;
    queries: number;
    upstream_sha256: string;
  };
  models: Record<string, string>;
  questions: { id: string; question: string }[];
};
export type Training = {
  name: string;
  history: Record<string, number>[];
  manifest: Record<string, unknown>;
};
export type Mode = "bm25" | "tfidf" | "hybrid" | "dense" | "graph";
export const modes: { id: Mode; name: string; detail: string }[] = [
  { id: "hybrid", name: "Hybrid RRF", detail: "Rank fusion" },
  { id: "bm25", name: "BM25", detail: "Sparse lexical" },
  { id: "tfidf", name: "TF-IDF", detail: "Cosine similarity" },
  { id: "graph", name: "Graph expansion", detail: "Concept co-occurrence" },
  { id: "dense", name: "Dense", detail: "SentenceTransformer + Qdrant" },
];
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    "/api" + path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  if (!response.ok) {
    let message;
    try {
      const data = await response.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : JSON.stringify(data.detail);
    } catch {
      message = response.statusText;
    }
    throw new Error(message || `Request failed (${response.status})`);
  }
  return response.json();
}
export function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
