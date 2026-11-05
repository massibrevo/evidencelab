# Integrated notebook studio

The control center now includes a real `.ipynb` editor, Python syntax highlighting, Markdown and LaTeX rendering, cell controls, execution outputs, and local notebook persistence.

```bash
pip install -e '.[notebooks]'
./scripts/dev.sh --notebooks
# If the usual ports are occupied:
EVIDENCELAB_WEB_PORT=5199 EVIDENCELAB_API_PORT=8199 ./scripts/dev.sh --notebooks
```

Without `--notebooks`, reading, editing, duplicating, importing, saving, and downloading notebooks still work. The Run actions return an actionable explanation rather than silently pretending to execute. No notebook executes when loaded or imported.

## Editing and execution

- Choose one of the four learning templates or create a new investigation.
- Edit Python with CodeMirror. Double-click a Markdown cell or use Edit to change its source. Markdown supports tables, links and LaTeX; raw HTML is not rendered.
- Save with the toolbar or Cmd/Ctrl-S. Run the selected code cell with Run cell or Cmd/Ctrl-Enter; Run all executes code cells sequentially. Shift-Enter also runs the selected code cell.
- Add Python/Markdown cells, move them, delete them, or undo the last cell deletion.
- Run saves pending edits before execution. Variable state persists within that notebook's kernel. Execution count and measured cell time appear with the real output.
- Interrupt stops the current Python calculation. Stop kernel clears its variables. Cell timeouts are configurable between 10 and 60 seconds; a timeout terminates the kernel and clears its state.
- Save conflicts are detected using revision hashes, so a stale browser tab cannot overwrite newer notebook changes.
- Download produces a normal `.ipynb` file containing the current source and captured outputs.

Edits to bundled learning templates are stored as workspace copies under `$EVIDENCELAB_HOME/notebook-workspace`; the repository templates remain unchanged. Imported notebook outputs are cleared in the UI before saving, and import never triggers execution. A maximum of three notebook kernels can be active at once. Cell output capture is bounded to 2 MiB; notebooks are bounded to 100 cells and 4 MiB.

## Trust boundary

A notebook kernel runs with your local user's filesystem and network permissions. It is **not a code sandbox**. The explicit startup option is appropriate for a trusted, single-user localhost workstation. Do not expose it to untrusted visitors. Standard research endpoints do not execute generated answers or start training.

Only plain text, errors and PNG images are displayed from kernel output. HTML/JavaScript/SVG display payloads are removed from execution results. All kernels stop when the API shuts down.

## Matplotlib notebook

`04_experiment_observatory.ipynb` loads the committed, measured SciFact CPU reference, generates score and failure-map figures, and exports an SVG. The source explicitly labels this as a **published reference experiment**, not a new benchmark on your current machine. Change metric/palette variables and rerun the plotting cells. No model weights, external APIs or training are needed.
