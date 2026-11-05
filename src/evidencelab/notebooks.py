"""Editable .ipynb workspace and explicit, trusted-local Jupyter execution.

No notebook executes on upload, load or save. Kernels start only after a Run
request when the operator has enabled execution at server startup.
"""

import copy
import hashlib
import json
import os
import queue
import re
import sys
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock, RLock

import nbformat

from .service import ROOT


class NotebookWorkspace:
    def __init__(self, home: Path, enabled: bool = False):
        self.root = home / "notebook-workspace"
        self.root.mkdir(parents=True, exist_ok=True)
        self.home = home.resolve()
        self.enabled = enabled
        bundled = ROOT / "notebooks"
        self.bundled = bundled if bundled.exists() else Path(__file__).parent / "resources/notebooks"
        self.lock = RLock()
        self.kernels = {}
        self.kernel_lock = Lock()
        self.execution_locks = {}

    @staticmethod
    def _id(identifier: str) -> str:
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}", identifier):
            raise ValueError("Invalid notebook ID")
        return identifier

    def _path(self, identifier: str) -> Path:
        name = self._id(identifier) + ".ipynb"
        custom = self.root / name
        if custom.exists():
            return custom
        bundled = self.bundled / name
        if bundled.exists():
            return bundled
        raise ValueError("Notebook not found")

    @staticmethod
    def _revision(notebook: dict) -> str:
        return hashlib.sha256(json.dumps(notebook, sort_keys=True).encode()).hexdigest()

    def get(self, identifier: str) -> dict:
        with self.lock:
            path = self._path(identifier)
            book = nbformat.read(path, as_version=4)
            title = book.metadata.get("title", identifier.replace("_", " ").title())
            return {
                "id": identifier,
                "title": title,
                "notebook": dict(book),
                "revision": self._revision(book),
                "origin": "workspace" if path.parent == self.root else "bundled",
                "execution_enabled": self.enabled,
                "kernel_running": identifier in self.kernels,
                "description": book.metadata.get("description", "Local research notebook"),
            }

    def list(self) -> dict:
        with self.lock:
            identifiers = sorted(
                {p.stem for folder in (self.bundled, self.root) for p in folder.glob("*.ipynb")}
            )
            notebooks = []
            for identifier in identifiers:
                result = self.get(identifier)
                cells = result.pop("notebook")["cells"]
                result["cells"] = len(cells)
                result["code_cells"] = sum(c["cell_type"] == "code" for c in cells)
                notebooks.append(result)
            return {
                "notebooks": notebooks,
                "execution_enabled": self.enabled,
                "enable_command": "pip install -e '.[notebooks]' && ./scripts/dev.sh --notebooks",
                "execution_notice": "Python cells run with your local user's permissions. Run only code you trust; "
                "notebooks never execute automatically.",
            }

    def create(self, title: str, template: str | None = None) -> dict:
        with self.lock:
            identifier = "lab-" + uuid.uuid4().hex[:12]
            if template:
                book = nbformat.from_dict(copy.deepcopy(self.get(template)["notebook"]))
                for cell in book.cells:
                    if cell.cell_type == "code":
                        cell.outputs, cell.execution_count = [], None
            else:
                book = nbformat.v4.new_notebook(
                    cells=[
                        nbformat.v4.new_markdown_cell(
                            f"# {title}\n\nDescribe the hypothesis, data and controls."
                        ),
                        nbformat.v4.new_code_cell("import numpy as np\nprint('Ready to investigate.')"),
                    ]
                )
            book.metadata.update(
                title=title,
                created=datetime.now(UTC).isoformat(),
                kernelspec={"name": "python3", "display_name": "EvidenceLab Python", "language": "python"},
            )
            nbformat.write(book, self.root / f"{identifier}.ipynb")
            return self.get(identifier)

    def save(self, identifier: str, notebook: dict, revision: str) -> dict:
        if len(json.dumps(notebook).encode()) > 4 * 1024**2:
            raise ValueError("Notebook exceeds 4 MiB")
        with self.lock:
            current = self.get(identifier)
            if revision != current["revision"]:
                raise ValueError(
                    "Notebook changed in another tab. Reload before saving to avoid overwriting edits."
                )
            if notebook.get("nbformat") != 4 or not isinstance(notebook.get("cells"), list):
                raise ValueError("Expected a version 4 notebook with a cells array")
            if len(notebook["cells"]) > 100:
                raise ValueError("Notebook supports at most 100 cells")
            for cell in notebook["cells"]:
                if not isinstance(cell, dict):
                    raise ValueError("Each cell must be an object")
                source = cell.get("source")
                if isinstance(source, list) and not all(isinstance(line, str) for line in source):
                    raise ValueError("Cell source arrays must contain only strings")
            book = nbformat.from_dict(notebook)
            for cell in book.cells:
                if not isinstance(cell.get("source"), (str, list)) or not isinstance(
                    cell.get("metadata", {}), dict
                ):
                    raise ValueError("Cells require string source and object metadata")
                cell.setdefault("metadata", {})
                if isinstance(cell.source, list):
                    cell.source = "".join(cell.source)
                if cell.cell_type not in {"code", "markdown"} or len(cell.source) > 40_000:
                    raise ValueError("Use code/Markdown cells of at most 40,000 characters")
                cell.metadata["trusted"] = False
            ids = [cell.get("id") for cell in book.cells]
            if None in ids or len(set(ids)) != len(ids):
                raise ValueError("Cell IDs must be present and unique")
            try:
                nbformat.validate(book)
            except nbformat.ValidationError as error:
                raise ValueError("Invalid notebook structure: " + error.message[:200]) from error
            book.metadata["modified"] = datetime.now(UTC).isoformat()
            destination = self.root / f"{self._id(identifier)}.ipynb"
            temporary = destination.with_suffix(".tmp")
            nbformat.write(book, temporary)
            temporary.replace(destination)
            return self.get(identifier)

    def _kernel(self, identifier: str):
        with self.kernel_lock:
            if identifier in self.kernels:
                return self.kernels[identifier]
            if len(self.kernels) >= 3:
                raise ValueError("Three notebook kernels are active. Stop one before starting another.")
            try:
                import ipykernel  # noqa: F401
                from jupyter_client import KernelManager
            except ImportError as error:
                raise ValueError("Install .[notebooks] in the API's Python environment to execute cells") from error

            directory = self.root / "kernels"
            directory.mkdir(exist_ok=True)
            km = KernelManager(kernel_name="python3", connection_file=str(directory / f"{identifier}.json"))
            km.kernel_spec.argv = [sys.executable, "-m", "ipykernel_launcher", "-f", "{connection_file}"]
            env = dict(
                os.environ,
                EVIDENCELAB_HOME=str(self.home),
                EVIDENCELAB_ROOT=str(ROOT),
                IPYTHONDIR=str(directory / "ipython"),
                MPLCONFIGDIR=str(
                    Path(os.environ.get("MPLCONFIGDIR", self.home / "cache/matplotlib")).resolve()
                ),
                MPLBACKEND="Agg",
            )
            workdir = self.root / "files"
            workdir.mkdir(exist_ok=True)
            try:
                km.start_kernel(cwd=str(workdir), env=env)
                client = km.client()
                client.start_channels()
                client.wait_for_ready(timeout=20)
            except Exception:
                km.shutdown_kernel(now=True)
                raise
            self.kernels[identifier] = (km, client)
            return km, client

    def run(self, identifier: str, cell_id: str, revision: str, timeout: int = 30) -> dict:
        if not self.enabled:
            raise ValueError(
                "Notebook execution is disabled. Install .[notebooks] and launch scripts/dev.sh --notebooks"
            )
        if not 1 <= timeout <= 60:
            raise ValueError("Cell timeout must be between 1 and 60 seconds")
        with self.lock:
            self._path(identifier)
            execution_lock = self.execution_locks.setdefault(identifier, Lock())
        if not execution_lock.acquire(blocking=False):
            raise ValueError("This notebook is already executing a cell")
        try:
            document = self.get(identifier)
            if revision != document["revision"]:
                raise ValueError("Notebook changed; save or reload before execution")
            cell = next((c for c in document["notebook"]["cells"] if c["id"] == cell_id), None)
            if cell is None or cell["cell_type"] != "code":
                raise ValueError("Select a code cell to run")
            _, client = self._kernel(identifier)
            message_id = client.execute(cell["source"], allow_stdin=False, stop_on_error=True)
            deadline, started = time.monotonic() + timeout, time.perf_counter()
            outputs, execution_count, output_bytes = [], None, 0
            failed, truncated = False, False
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    self.stop(identifier)
                    outputs.append(
                        nbformat.v4.new_output(
                            "error",
                            ename="ExecutionTimeout",
                            evalue="Cell timed out. Kernel stopped; variables have been cleared.",
                            traceback=[],
                        )
                    )
                    failed = True
                    break
                try:
                    message = client.get_iopub_msg(timeout=min(remaining, 1))
                except queue.Empty:
                    continue
                if message.get("parent_header", {}).get("msg_id") != message_id:
                    continue
                kind, content = message["msg_type"], message["content"]
                if kind == "status" and content["execution_state"] == "idle":
                    break
                if kind == "execute_input":
                    execution_count = content["execution_count"]
                if kind == "clear_output":
                    outputs, output_bytes = [], 0
                if kind in {"stream", "display_data", "execute_result", "error"}:
                    failed |= kind == "error"
                    if kind in {"display_data", "execute_result"}:
                        # HTML/JavaScript/SVG outputs are not exposed as executable document content.
                        content = {
                            **content,
                            "data": {
                                k: v
                                for k, v in content.get("data", {}).items()
                                if k in {"text/plain", "image/png"}
                            },
                            "metadata": {},
                        }
                        message = {**message, "content": content}
                    size = len(json.dumps(content))
                    if output_bytes + size <= 2 * 1024**2:
                        outputs.append(nbformat.v4.output_from_msg(message))
                        output_bytes += size
                    elif not truncated:
                        outputs.append(
                            nbformat.v4.new_output(
                                "stream", name="stderr", text="[Output truncated at 2 MiB]\n"
                            )
                        )
                        truncated = True
            cell["outputs"], cell["execution_count"] = outputs, execution_count
            cell.setdefault("metadata", {})["evidencelab"] = {
                "elapsed_ms": (time.perf_counter() - started) * 1000,
                "status": "error" if failed else "completed",
            }
            saved = self.save(identifier, document["notebook"], revision)
            return {**saved, "cell_id": cell_id, "status": "error" if failed else "completed"}
        finally:
            execution_lock.release()

    def interrupt(self, identifier: str) -> dict:
        with self.kernel_lock:
            if identifier in self.kernels:
                self.kernels[identifier][0].interrupt_kernel()
        return {"status": "interrupt requested"}

    def stop(self, identifier: str) -> dict:
        with self.kernel_lock:
            pair = self.kernels.pop(identifier, None)
            if pair:
                manager, client = pair
                client.stop_channels()
                manager.shutdown_kernel(now=True)
        return {"status": "stopped", "variables_cleared": True}

    def close(self):
        for identifier in list(self.kernels):
            self.stop(identifier)
