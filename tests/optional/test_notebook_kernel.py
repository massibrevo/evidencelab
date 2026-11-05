"""Explicit local-kernel integration. No model weights, network calls, or training."""

import os

import pytest

from evidencelab.notebooks import NotebookWorkspace

pytestmark = pytest.mark.skipif(
    os.environ.get("EVIDENCELAB_TEST_NOTEBOOKS") != "1", reason="Explicit local Jupyter kernel test"
)


def test_real_python_kernel_outputs_state_and_plot(tmp_path):
    workspace = NotebookWorkspace(tmp_path, enabled=True)
    try:
        book = workspace.create("Kernel integration")
        cell = next(c for c in book["notebook"]["cells"] if c["cell_type"] == "code")
        cell["source"] = "value = 6 * 7\nprint(value)"
        book = workspace.save(book["id"], book["notebook"], book["revision"])
        result = workspace.run(book["id"], cell["id"], book["revision"], timeout=60)
        executed = next(c for c in result["notebook"]["cells"] if c["id"] == cell["id"])
        assert result["status"] == "completed"
        assert "42" in "".join(o.get("text", "") for o in executed["outputs"])
        executed["source"] = (
            'print(value + 1)\nfrom IPython.display import Image, display\nfrom matplotlib.figure import Figure\nimport io\nfig=Figure()\nax=fig.subplots()\nax.plot([0,1],[0,1])\nimage=io.BytesIO()\nfig.savefig(image,format="png")\ndisplay(Image(image.getvalue()))'
        )
        book = workspace.save(book["id"], result["notebook"], result["revision"])
        result = workspace.run(book["id"], cell["id"], book["revision"], timeout=60)
        outputs = next(c for c in result["notebook"]["cells"] if c["id"] == cell["id"])["outputs"]
        assert "43" in "".join(o.get("text", "") for o in outputs)
        assert any("image/png" in o.get("data", {}) for o in outputs), str(outputs)[:2000]
        workspace.stop(book["id"])
        assert not workspace.get(book["id"])["kernel_running"]
    finally:
        workspace.close()
