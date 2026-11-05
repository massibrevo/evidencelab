"""Optional local Qdrant index. Model downloads happen only when explicitly enabled."""

import uuid

import numpy as np


class DenseBackend:
    def __init__(self, chunks, model_id: str = "sentence-transformers/all-MiniLM-L6-v2"):
        from qdrant_client import QdrantClient, models
        from sentence_transformers import SentenceTransformer

        self.encoder = SentenceTransformer(model_id)
        self.vectors = np.asarray(
            self.encoder.encode([c.title + " " + c.text for c in chunks], normalize_embeddings=True)
        )
        self.client = QdrantClient(location=":memory:")
        self.collection = "chunks"
        self.client.create_collection(
            self.collection,
            vectors_config=models.VectorParams(size=self.vectors.shape[1], distance=models.Distance.COSINE),
        )
        self.ids = {str(uuid.uuid5(uuid.NAMESPACE_URL, c.id)): i for i, c in enumerate(chunks)}
        self.client.upsert(
            self.collection,
            points=[
                models.PointStruct(
                    id=str(uuid.uuid5(uuid.NAMESPACE_URL, c.id)),
                    vector=v.tolist(),
                    payload={"chunk_id": c.id},
                )
                for c, v in zip(chunks, self.vectors)
            ],
        )
        self.chunks, self.cross_encoder = chunks, None

    def scores(self, query: str) -> np.ndarray:
        vector = self.encoder.encode(query, normalize_embeddings=True).tolist()
        hits = self.client.query_points(self.collection, query=vector, limit=len(self.chunks)).points
        values = np.zeros(len(self.chunks))
        for hit in hits:
            values[self.ids[str(hit.id)]] = hit.score
        return values

    def rerank(self, query: str, indices: list[int]) -> list[int]:
        from sentence_transformers import CrossEncoder

        if self.cross_encoder is None:
            self.cross_encoder = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        scores = self.cross_encoder.predict([(query, self.chunks[i].text) for i in indices])
        return [indices[int(i)] for i in np.argsort(-scores)]
