from typing import Literal

from pydantic import BaseModel, Field


class Paper(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=1000)
    text: str = Field(min_length=1, max_length=2_000_000)
    source: str = "local"
    year: int | None = None
    license: str = "User supplied; verify redistribution rights"
    dataset: str = "user"


class Chunk(BaseModel):
    id: str
    paper_id: str
    title: str
    text: str
    start: int
    end: int
    source: str


class Query(BaseModel):
    question: str = Field(min_length=3, max_length=2000)
    mode: Literal["bm25", "tfidf", "hybrid", "dense", "graph"] = "hybrid"
    k: int = Field(default=4, ge=1, le=20)
    rewrite: bool = True
    rerank: bool = False


class Investigation(Query):
    architecture: Literal["single", "supervisor", "hierarchical", "swarm"] = "supervisor"
    thread_id: str = Field(default="default", min_length=1, max_length=100)


class TextUpload(BaseModel):
    title: str = Field(min_length=1, max_length=1000)
    text: str = Field(min_length=20, max_length=2_000_000)


class BenchmarkRequest(BaseModel):
    modes: list[Literal["bm25", "tfidf", "hybrid", "graph", "dense"]] = Field(
        default=["bm25", "tfidf", "hybrid"], min_length=1, max_length=5
    )
    k: int = Field(default=3, ge=1, le=20)
    seed: int = 42
    rewrite: bool = False
    rerank: bool = False
    resamples: int = Field(default=2000, ge=200, le=10000)
    architecture: Literal["single", "supervisor", "hierarchical", "swarm"] | None = None


class ArxivRequest(BaseModel):
    identifier: str = Field(pattern=r"^\d{4}\.\d{4,5}(v\d+)?$")
