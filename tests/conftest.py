import pytest

from evidencelab.retrieval import Index
from evidencelab.schema import Paper


@pytest.fixture
def papers():
    return [
        Paper(
            id="a",
            title="Low rank adaptation",
            text="LoRA trains low rank adapters. Quantization saves memory.",
        ),
        Paper(
            id="b",
            title="Evidence retrieval",
            text="BM25 retrieves documents. Retrieval helps find scientific evidence.",
        ),
        Paper(
            id="c",
            title="Cell biology",
            text="Protein expression regulates cell growth. Cell division is a biological process.",
        ),
    ]


@pytest.fixture
def index(papers):
    return Index(papers)
