"""Security boundaries for the local web service and its child runtimes."""

import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Child tools need OS paths and local caches. Integration credentials belong to the API process.
RUNTIME_VARIABLES = (
    "PATH", "HOME", "USERPROFILE", "SYSTEMROOT", "WINDIR", "LANG", "LC_ALL", "LC_CTYPE",
    "TMPDIR", "TEMP", "TMP", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "HF_HOME", "HF_HUB_CACHE",
    "HF_DATASETS_CACHE", "TRANSFORMERS_CACHE", "TORCH_HOME", "CUDA_VISIBLE_DEVICES",
    "OMP_NUM_THREADS", "MKL_NUM_THREADS", "PYTORCH_ENABLE_MPS_FALLBACK",
)


def local_runtime_env() -> dict[str, str]:
    return {key: os.environ[key] for key in RUNTIME_VARIABLES if key in os.environ}


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    temporary = None
    try:
        with NamedTemporaryFile(
            "w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False
        ) as stream:
            temporary = Path(stream.name)
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


class RequestBodyLimit:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return
        path = scope["path"]
        if path == "/api/ingest/pdf":
            limit = 21 * 1024**2
        elif path.startswith("/api/notebooks/"):
            limit = 5 * 1024**2
        else:
            limit = 2 * 1024**2

        error = "Request body is too large"
        headers = dict(scope["headers"])
        length = headers.get(b"content-length", b"0")
        if length.isdigit() and (len(length) > 10 or int(length) > limit):
            await JSONResponse({"detail": error}, status_code=413)(scope, receive, send)
            return

        size = 0

        async def bounded_receive() -> Message:
            nonlocal size
            message = await receive()
            if message["type"] == "http.request":
                size += len(message.get("body", b""))
                if size > limit:
                    raise HTTPException(413, error)
            return message

        await self.app(scope, bounded_receive, send)
