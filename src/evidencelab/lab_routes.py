"""Notebook, analytics and scientific figure endpoints."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .analytics import benchmark_catalog, find_benchmark, resource_snapshot, summarize
from .figures import benchmark_csv, render_benchmark

router = APIRouter(prefix="/api")


class NotebookCreate(BaseModel):
    title: str = Field(default="Untitled investigation", min_length=1, max_length=120)
    template: str | None = None


class NotebookSave(BaseModel):
    notebook: dict
    revision: str = Field(min_length=64, max_length=64)


class NotebookRun(BaseModel):
    cell_id: str = Field(min_length=1, max_length=100)
    revision: str = Field(min_length=64, max_length=64)
    timeout: int = Field(default=30, ge=1, le=60)


@router.get("/analytics")
def analytics(request: Request):
    return summarize(request.app.state.lab)


@router.get("/resources")
def resources():
    return resource_snapshot()


@router.get("/experiments")
def experiments(request: Request):
    return benchmark_catalog(request.app.state.lab)


@router.get("/experiments/{identifier}/figure")
def figure(
    identifier: str,
    request: Request,
    chart: Literal["scores", "latency", "heatmap", "tradeoff"] = "scores",
    metric: Literal["recall", "mrr", "ndcg"] = "recall",
    format: Literal["png", "svg", "pdf"] = "png",
    theme: Literal["dark", "paper"] = "dark",
    palette: Literal["spectrum", "ocean", "accessible"] = "spectrum",
    download: bool = False,
):
    try:
        run = find_benchmark(request.app.state.lab, identifier)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    content = render_benchmark(run, chart, metric, format, theme, palette)
    mime = {"png": "image/png", "svg": "image/svg+xml", "pdf": "application/pdf"}[format]
    return Response(
        content,
        media_type=mime,
        headers={
            "Content-Disposition": f"{'attachment' if download else 'inline'}; filename=evidencelab-{chart}-{identifier[:8]}.{format}"
        },
    )


@router.get("/experiments/{identifier}/csv")
def csv_export(identifier: str, request: Request):
    try:
        run = find_benchmark(request.app.state.lab, identifier)
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    return Response(
        benchmark_csv(run),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=experiment-{identifier[:8]}.csv"},
    )


@router.get("/notebooks")
def notebooks(request: Request):
    return request.app.state.notebooks.list()


@router.post("/notebooks")
def create(body: NotebookCreate, request: Request):
    return request.app.state.notebooks.create(body.title, body.template)


@router.get("/notebooks/{identifier}")
def notebook(identifier: str, request: Request):
    return request.app.state.notebooks.get(identifier)


@router.put("/notebooks/{identifier}")
def save_notebook(identifier: str, body: NotebookSave, request: Request):
    return request.app.state.notebooks.save(identifier, body.notebook, body.revision)


@router.post("/notebooks/{identifier}/run")
def run_notebook(identifier: str, body: NotebookRun, request: Request):
    return request.app.state.notebooks.run(identifier, body.cell_id, body.revision, body.timeout)


@router.post("/notebooks/{identifier}/interrupt")
def interrupt_notebook(identifier: str, request: Request):
    return request.app.state.notebooks.interrupt(identifier)


@router.post("/notebooks/{identifier}/stop")
def stop_notebook(identifier: str, request: Request):
    return request.app.state.notebooks.stop(identifier)
