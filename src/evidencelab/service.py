import json
import os
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock

from .agents import ResearchAgents
from .evaluation import evaluate
from .models import MODEL_IDS, ExtractiveGenerator, ModelConfig, TransformersGenerator
from .retrieval import Index
from .schema import Paper, Query
from .store import Store

ROOT = Path(os.environ.get("EVIDENCELAB_ROOT", str(Path(__file__).resolve().parents[2])))


def data_dir() -> Path:
    if configured := os.environ.get("EVIDENCELAB_DATA"):
        return Path(configured)
    checkout = ROOT / "data"
    if (checkout / "demo/papers.json").exists():
        return checkout
    return Path(__file__).resolve().parent / "resources"


class Lab:
    def __init__(self, home: Path | None = None, seed: bool = True):
        self.home = home or Path(os.environ.get("EVIDENCELAB_HOME", ".evidencelab"))
        self.home.mkdir(parents=True, exist_ok=True)
        self.store = Store(self.home / "lab.sqlite3")
        self.lock = RLock()
        if seed and not self.store.papers():
            path = data_dir() / "demo/papers.json"
            if not path.exists():
                raise FileNotFoundError("Demo data missing. Run from the checkout or set EVIDENCELAB_DATA")
            self.store.add([Paper.model_validate(p) for p in json.loads(path.read_text())])
        key = os.environ.get("EVIDENCELAB_MODEL")
        self.generator = (
            TransformersGenerator(
                ModelConfig(
                    model_id=MODEL_IDS.get(key, key),
                    revision=os.environ.get("EVIDENCELAB_REVISION", "main"),
                    quantization=os.environ.get("EVIDENCELAB_QUANTIZATION", "none"),
                    adapter=os.environ.get("EVIDENCELAB_ADAPTER"),
                )
            )
            if key
            else ExtractiveGenerator()
        )
        self.rebuild()

    def rebuild(self) -> None:
        self.index = Index(self.store.papers())
        if os.environ.get("EVIDENCELAB_DENSE") == "1" and self.index.chunks:
            from .dense import DenseBackend

            self.index.dense_backend = DenseBackend(self.index.chunks)
        self.agents = ResearchAgents(self.index, self.generator)

    def add(self, paper: Paper) -> None:
        with self.lock:
            self.store.add([paper])
            self.rebuild()

    def ask(self, request: Query) -> dict:
        with self.lock:
            start = time.perf_counter()
            evidence = self.index.search(
                request.question, request.mode, request.k, rewrite=request.rewrite, rerank=request.rerank
            )
            result = {
                "id": str(uuid.uuid4()),
                "created": datetime.now(UTC).isoformat(),
                "question": request.question,
                "config": request.model_dump(),
                "evidence": evidence,
                "engine": self.generator.name,
                **self.generator.generate(request.question, evidence),
                "latency_ms": (time.perf_counter() - start) * 1000,
            }
            self.store.save_run(result, "query")
            return result

    def benchmark(self, modes: list[str], k: int, seed: int, **kwargs) -> dict:
        with self.lock:
            queries = json.loads((data_dir() / "demo/queries.json").read_text())
            architecture_label = kwargs.pop("architecture_label", None)
            result = evaluate(self.index, queries, modes, k, seed, generator=self.generator, **kwargs)
            result["engine"] = self.generator.name
            result["architecture"] = architecture_label
            self.store.save_run(result, "benchmark")
            (self.home / f"benchmark-{result['id']}.json").write_text(json.dumps(result, indent=2))
            return result
