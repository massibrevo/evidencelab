"""Execute educational CPU notebooks; writes executed copies outside source control."""

import os
from pathlib import Path

import nbformat
from nbclient import NotebookClient


def main():
    root = Path(__file__).resolve().parents[1]
    out = root / ".evidencelab/notebooks"
    out.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("IPYTHONDIR", str(out / "ipython"))
    os.environ.setdefault("JUPYTER_RUNTIME_DIR", str(out / "runtime"))
    for path in sorted((root / "notebooks").glob("*.ipynb")):
        notebook = nbformat.read(path, as_version=4)
        NotebookClient(
            notebook, timeout=60, kernel_name="python3", resources={"metadata": {"path": str(out)}}
        ).execute()
        nbformat.write(notebook, out / path.name)
        print(f"Executed {path.name}")


if __name__ == "__main__":
    main()
