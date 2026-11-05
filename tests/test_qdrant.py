"""Real embedded Qdrant, deterministic test encoder. No neural-quality claim."""

import sys
import types

import numpy as np
import pytest

from evidencelab.dense import DenseBackend


def test_qdrant_cosine_and_payload_mapping(monkeypatch, index):
    pytest.importorskip("qdrant_client")

    class Encoder:
        def __init__(self, *args, **kwargs):
            pass

        def encode(self, texts, **kwargs):
            def one(text):
                return np.array([float("rank" in text.lower()), float("retriev" in text.lower()), 0.01])

            if isinstance(texts, str):
                value = one(texts)
                return value / np.linalg.norm(value)
            return np.array([one(t) / np.linalg.norm(one(t)) for t in texts])

    monkeypatch.setitem(
        sys.modules, "sentence_transformers", types.SimpleNamespace(SentenceTransformer=Encoder)
    )
    backend = DenseBackend(index.chunks)
    index.dense_backend = backend
    hits = index.search("low rank adapters", "dense")
    assert hits[0]["paper_id"] == "a"
    assert hits[0]["dense"] > 0.9
    assert index.projection()["representation"] == "sentence-transformer"
    backend.client.close()
