"""Transparent lexical baseline plus optional neural retrieval. No hidden fallbacks."""

import math
import re
from collections import Counter
from typing import Any

import numpy as np

from .ingest import chunk_paper
from .schema import Paper

STOP = set(
    "a an the is are was were of for to in on and or with by from does do what how which that this".split()
)
CONCEPTS = {
    "retrieval": {"retrieval", "retriever", "rag", "bm25", "search", "evidence"},
    "adaptation": {"lora", "qlora", "finetuning", "fine", "adapter", "quantization", "training"},
    "verification": {"claim", "claims", "verification", "faithfulness", "factual", "fact"},
    "coordination": {"agent", "agents", "swarm", "coordination", "collaboration", "planning"},
    "biology": {"cells", "cell", "protein", "expression", "gene", "cancer", "dna"},
}


def tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOP and len(t) > 1]


def rewrite_query(query: str) -> str:
    expansions = {
        "qlora": "quantization low rank adapter",
        "rag": "retrieval augmented generation",
        "dpo": "direct preference optimization",
        "grpo": "group relative policy optimization",
    }
    return query + " " + " ".join(v for k, v in expansions.items() if k in tokens(query))


class Index:
    def __init__(self, papers: list[Paper]):
        self.chunks = [c for p in papers for c in chunk_paper(p)]
        self.docs = [Counter(tokens(c.title + " " + c.text)) for c in self.chunks]
        self.df = Counter(t for doc in self.docs for t in doc)
        self.vocab = {term: i for i, term in enumerate(sorted(self.df))}
        n = len(self.docs)
        self.idf = {t: math.log((n + 1) / (df + 1)) + 1 for t, df in self.df.items()}
        self.lengths = np.array([sum(d.values()) for d in self.docs], dtype=float)
        self.avg = float(self.lengths.mean()) if n else 1.0
        self.matrix = self._encode([c.title + " " + c.text for c in self.chunks])
        self.dense_backend = None

    def _encode(self, texts: list[str]) -> np.ndarray:
        vectors = np.zeros((len(texts), len(self.vocab)))
        for row, text in enumerate(texts):
            for term, count in Counter(tokens(text)).items():
                if term in self.vocab:
                    vectors[row, self.vocab[term]] = (1 + math.log(count)) * self.idf[term]
        return vectors / np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12)

    def search(
        self, question: str, mode: str = "hybrid", k: int = 4, rewrite: bool = True, rerank: bool = False
    ) -> list[dict[str, Any]]:
        if not self.chunks:
            return []
        query = rewrite_query(question) if rewrite else question
        qterms = set(tokens(query))
        # Abstain for out-of-vocabulary queries instead of returning arbitrary zero-score chunks.
        if not qterms.intersection(self.vocab) and self.dense_backend is None:
            return []
        bm = np.zeros(len(self.docs))
        for term in qterms:
            df = self.df.get(term, 0)
            idf = math.log(1 + (len(self.docs) - df + 0.5) / (df + 0.5))
            tf = np.array([d.get(term, 0) for d in self.docs], dtype=float)
            bm += idf * (tf * 2.5) / (tf + 1.5 * (0.25 + 0.75 * self.lengths / self.avg))
        tfidf = self.matrix @ self._encode([query])[0]
        bm_order = np.argsort(-bm, kind="stable")
        tf_order = np.argsort(-tfidf, kind="stable")
        dense_scores = None
        if mode == "dense":
            if self.dense_backend is None:
                raise ValueError("Dense retrieval requires the rag extra and EVIDENCELAB_DENSE=1")
            dense_scores = self.dense_backend.scores(query)
            scores = dense_scores
        elif mode == "bm25":
            scores = bm
        elif mode == "tfidf":
            scores = tfidf
        elif mode in {"hybrid", "graph"}:
            # RRF; zero-overlap chunks cannot get a positive fused score.
            other = tf_order
            if self.dense_backend is not None:
                dense_scores = self.dense_backend.scores(query)
                other = np.argsort(-dense_scores, kind="stable")
            scores = np.zeros(len(self.docs))
            for order in (bm_order, other):
                for rank, i in enumerate(order):
                    scores[i] += 1 / (60 + rank + 1)
            if self.dense_backend is None:
                scores[(bm == 0) & (tfidf == 0)] = 0
            if mode == "graph":
                seed_terms = set(tokens(self.chunks[int(np.argmax(scores))].text))
                concepts = [v for v in CONCEPTS.values() if v & seed_terms and v & qterms]
                for i, doc in enumerate(self.docs):
                    scores[i] += 0.002 * sum(bool(set(doc) & c) for c in concepts)
        else:
            raise ValueError(f"Unknown retrieval mode: {mode}")
        order = [int(i) for i in np.argsort(-scores, kind="stable") if scores[i] > 0]
        if rerank:
            if self.dense_backend is None:
                raise ValueError("Neural reranking requires EVIDENCELAB_DENSE=1 and the rag extra")
            order = self.dense_backend.rerank(query, order)
        results, seen = [], set()
        for i in order:
            c = self.chunks[i]
            if c.paper_id in seen:
                continue
            seen.add(c.paper_id)
            results.append(
                {
                    **c.model_dump(),
                    "score": round(float(scores[i]), 6),
                    "bm25": round(float(bm[i]), 4),
                    "tfidf": round(float(tfidf[i]), 4),
                    "dense": None if dense_scores is None else round(float(dense_scores[i]), 4),
                }
            )
            if len(results) == k:
                break
        return results

    def projection(self, method: str = "pca") -> dict:
        matrix = self.dense_backend.vectors if self.dense_backend is not None else self.matrix
        if len(matrix) < 3:
            coords = np.zeros((len(matrix), 2))
        elif method == "umap":
            try:
                from umap import UMAP
            except ImportError as e:
                raise ValueError("Install evidencelab[rag] to enable UMAP") from e
            coords = UMAP(
                n_components=2, random_state=42, n_neighbors=min(10, len(matrix) - 1), init="random"
            ).fit_transform(matrix)
        elif method == "pca":
            centered = matrix - matrix.mean(axis=0)
            u, s, _ = np.linalg.svd(centered, full_matrices=False)
            coords = u[:, :2] * s[:2]
            if coords.shape[1] < 2:
                coords = np.pad(coords, ((0, 0), (0, 2 - coords.shape[1])))
        else:
            raise ValueError("Projection must be pca or umap")
        return {
            "method": method,
            "representation": "sentence-transformer" if self.dense_backend else "TF-IDF",
            "points": [
                {
                    "id": c.id,
                    "paper_id": c.paper_id,
                    "title": c.title,
                    "x": float(xy[0]),
                    "y": float(xy[1]),
                    "group": max(CONCEPTS, key=lambda key: len(CONCEPTS[key] & set(tokens(c.text)))),
                }
                for c, xy in zip(self.chunks, coords)
            ],
        }

    def graph(self) -> dict:
        edges = []
        for c in self.chunks:
            for label, terms in CONCEPTS.items():
                overlap = len(terms & set(tokens(c.text)))
                if overlap >= 2:
                    edges.append({"source": c.paper_id, "target": label, "weight": overlap})
        return {
            "kind": "heuristic concept co-occurrence; not Microsoft GraphRAG",
            "concepts": list(CONCEPTS),
            "edges": edges,
        }
