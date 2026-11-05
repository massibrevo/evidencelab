import hashlib
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .ingest import arxiv_paper, pdf_paper
from .models import MODEL_IDS, hardware
from .schema import ArxivRequest, BenchmarkRequest, Investigation, Paper, Query, TextUpload
from .service import ROOT, Lab, data_dir


def create_app(lab: Lab | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app):
        app.state.lab = lab or Lab()
        yield
        if lab is None:
            app.state.lab.store.close()

    app = FastAPI(title="EvidenceLab", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            f"http://{host}:{os.environ.get('EVIDENCELAB_WEB_PORT', '5173')}"
            for host in ("localhost", "127.0.0.1")
        ],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    @app.middleware("http")
    async def local_origin_guard(request: Request, call_next):
        # CORS alone does not block cross-origin multipart form submissions.
        origin = request.headers.get("origin")
        trusted = {
            f"http://{host}:{port}"
            for host in ("localhost", "127.0.0.1")
            for port in (
                os.environ.get("EVIDENCELAB_WEB_PORT", "5173"),
                os.environ.get("EVIDENCELAB_API_PORT", "8000"),
            )
        }
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and origin and origin not in trusted:
            from fastapi.responses import JSONResponse

            return JSONResponse(status_code=403, content={"detail": "Cross-origin mutation rejected"})
        return await call_next(request)

    @app.exception_handler(ValueError)
    async def invalid(_, error):
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=400, content={"detail": str(error)})

    def get(request: Request) -> Lab:
        return request.app.state.lab

    @app.get("/api/health")
    def health(request: Request):
        instance = get(request)
        return {
            "status": "ready",
            "engine": instance.generator.name,
            "dense": instance.index.dense_backend is not None,
        }

    @app.get("/api/overview")
    def overview(request: Request):
        instance = get(request)
        return {
            "papers": len(instance.store.papers()),
            "chunks": len(instance.index.chunks),
            "runs": len(instance.store.runs()),
            "engine": instance.generator.name,
            "dense": instance.index.dense_backend is not None,
            "hardware": hardware(),
            "dataset": json.loads((data_dir() / "demo/manifest.json").read_text()),
            "models": MODEL_IDS,
            "questions": json.loads((data_dir() / "demo/queries.json").read_text())[:6],
        }

    @app.get("/api/papers")
    def papers(request: Request):
        return [
            p.model_dump(exclude={"text"}) | {"characters": len(p.text)} for p in get(request).store.papers()
        ]

    @app.get("/api/papers/{paper_id}")
    def paper(paper_id: str, request: Request):
        result = next((p for p in get(request).store.papers() if p.id == paper_id), None)
        if result is None:
            raise HTTPException(404, "Paper not found")
        return result.model_dump()

    @app.post("/api/ingest/text")
    def text_upload(body: TextUpload, request: Request):
        paper = Paper(id="text-" + hashlib.sha256(body.text.encode()).hexdigest()[:16], **body.model_dump())
        get(request).add(paper)
        return {"id": paper.id, "status": "indexed"}

    @app.post("/api/ingest/pdf")
    def upload_pdf(request: Request, file: UploadFile = File(...)):
        content = file.file.read(20 * 1024 * 1024 + 1)
        try:
            paper = pdf_paper(content, Path(file.filename or "paper.pdf").name)
        except Exception as e:
            raise HTTPException(400, f"Could not parse PDF: {str(e)[:200]}") from e
        get(request).add(paper)
        return {"id": paper.id, "status": "indexed"}

    @app.post("/api/ingest/arxiv")
    def arxiv(body: ArxivRequest, request: Request):
        try:
            paper = arxiv_paper(body.identifier)
        except httpx.HTTPError as e:
            raise HTTPException(502, "arXiv fetch failed; check connectivity and identifier") from e
        get(request).add(paper)
        return {"id": paper.id, "status": "indexed"}

    @app.post("/api/ask")
    def ask(body: Query, request: Request):
        return get(request).ask(body)

    @app.post("/api/investigate")
    def investigate(body: Investigation, request: Request):
        instance = get(request)
        with instance.lock:
            result = instance.agents.investigate(**body.model_dump())
            instance.store.save_run(result, "investigation")
            return result

    @app.get("/api/vectors")
    def vectors(request: Request, method: Literal["pca", "umap"] = "pca"):
        with get(request).lock:
            return get(request).index.projection(method)

    @app.get("/api/graph")
    def graph(request: Request):
        return get(request).index.graph()

    @app.post("/api/benchmarks")
    def benchmark(body: BenchmarkRequest, request: Request):
        return get(request).benchmark(body.modes, body.k, body.seed)

    @app.get("/api/runs")
    def runs(request: Request, kind: Literal["query", "benchmark", "investigation"] | None = None):
        return get(request).store.runs(kind)

    @app.get("/api/training")
    def training(request: Request):
        # Read only from local artifact root; this endpoint never starts training.
        root = get(request).home / "training"
        result = []
        for p in sorted(root.glob("*/history.json")):
            try:
                result.append(
                    {
                        "name": p.parent.name,
                        "history": json.loads(p.read_text()),
                        "manifest": json.loads((p.parent / "manifest.json").read_text()),
                    }
                )
            except (OSError, json.JSONDecodeError):
                continue
        return result

    @app.get("/api/foundation")
    def foundation(request: Request):
        from .foundation import SUITES

        result = []
        for path in sorted((get(request).home / "foundation").glob("*/summary.json")):
            try:
                result.append(json.loads(path.read_text()))
            except (OSError, json.JSONDecodeError):
                continue
        return {"suites": SUITES, "runs": result}

    dist = ROOT / "web/dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/")
        def index():
            return FileResponse(dist / "index.html")

    return app
