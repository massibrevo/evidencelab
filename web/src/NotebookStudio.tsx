import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  Code2,
  Copy,
  FilePlus2,
  FolderOpen,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Save,
  Square,
  Text,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { api, download } from "./types";
import { Code, Empty, IconButton, Tag } from "./UI";

type Output = {
  output_type: string;
  name?: string;
  text?: string | string[];
  data?: Record<string, string | string[]>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
};
type Cell = {
  id: string;
  cell_type: "code" | "markdown";
  source: string;
  metadata: Record<string, unknown>;
  outputs?: Output[];
  execution_count?: number | null;
};
type Book = {
  cells: Cell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
};
type Document = {
  id: string;
  title: string;
  notebook: Book;
  revision: string;
  origin: string;
  execution_enabled: boolean;
  kernel_running: boolean;
  description: string;
  status?: string;
};
type Catalog = {
  notebooks: (Omit<Document, "notebook"> & {
    cells: number;
    code_cells: number;
  })[];
  execution_enabled: boolean;
  enable_command: string;
  execution_notice: string;
};
const plain = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.join("") : (value ?? "");
const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, "");
function Markdown({ source }: { source: string }) {
  return (
    <div className="notebook-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        skipHtml
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
export default function NotebookStudio() {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [doc, setDoc] = useState<Document | null>(null),
    [dirty, setDirty] = useState(false),
    [active, setActive] = useState<string | null>(null),
    [editingMarkdown, setEditingMarkdown] = useState<string | null>(null),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [timeout, setTimeoutSeconds] = useState(30),
    [stopOnError, setStopOnError] = useState(true),
    [deleted, setDeleted] = useState<{ cell: Cell; index: number } | null>(
      null,
    ),
    [rail, setRail] = useState(true);
  const current = useRef<Document | null>(null),
    isDirty = useRef(false),
    fileRef = useRef<HTMLInputElement>(null);
  const update = (value: Document, changed = false) => {
    current.current = value;
    isDirty.current = changed;
    setDoc(value);
    setDirty(changed);
  };
  const refreshCatalog = useCallback(async () => {
    const response = await api<Catalog>("/notebooks");
    setCatalog(response);
    return response;
  }, []);
  useEffect(() => {
    refreshCatalog()
      .then(async (c) => {
        if (c.notebooks.length) {
          const preferred =
            c.notebooks.find((n) => n.id === "04_experiment_observatory") ??
            c.notebooks[0];
          const value = await api<Document>(`/notebooks/${preferred.id}`);
          update(value);
          setActive(value.notebook.cells[0]?.id ?? null);
        }
      })
      .catch((e) => setError(e.message));
  }, [refreshCatalog]);
  const saveNow = async () => {
    let value = current.current;
    if (!value) return null;
    if (!isDirty.current) return value;
    value = await api<Document>(
      `/notebooks/${value.id}`,
      { notebook: value.notebook, revision: value.revision },
      "PUT",
    );
    update(value);
    void refreshCatalog();
    return value;
  };
  const load = async (id: string) => {
    setError("");
    try {
      await saveNow();
      const value = await api<Document>(`/notebooks/${id}`);
      update(value);
      setActive(value.notebook.cells[0]?.id ?? null);
      setEditingMarkdown(null);
      setDeleted(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const modify = (cells: Cell[]) => {
    const value = current.current;
    if (value)
      update({ ...value, notebook: { ...value.notebook, cells } }, true);
  };
  const edit = (id: string, source: string) => {
    const value = current.current;
    if (value)
      modify(
        value.notebook.cells.map((c) =>
          c.id === id
            ? {
                ...c,
                source,
                ...(c.cell_type === "code"
                  ? { outputs: [], execution_count: null }
                  : {}),
              }
            : c,
        ),
      );
  };
  const add = (type: "code" | "markdown", after?: string) => {
    const value = current.current;
    if (!value) return;
    const cell: Cell = {
      id: crypto.randomUUID(),
      cell_type: type,
      source: type === "markdown" ? "## Notes\n\nRecord an observation." : "",
      metadata: {},
      ...(type === "code" ? { outputs: [], execution_count: null } : {}),
    };
    const cells = [...value.notebook.cells];
    const at = after
      ? cells.findIndex((c) => c.id === after) + 1
      : cells.length;
    cells.splice(at, 0, cell);
    modify(cells);
    setActive(cell.id);
    if (type === "markdown") setEditingMarkdown(cell.id);
  };
  const move = (id: string, delta: number) => {
    const value = current.current;
    if (!value) return;
    const cells = [...value.notebook.cells],
      i = cells.findIndex((c) => c.id === id),
      j = i + delta;
    if (j < 0 || j >= cells.length) return;
    [cells[i], cells[j]] = [cells[j], cells[i]];
    modify(cells);
  };
  const remove = (id: string) => {
    const value = current.current;
    if (!value) return;
    const index = value.notebook.cells.findIndex((c) => c.id === id);
    setDeleted({ cell: value.notebook.cells[index], index });
    modify(value.notebook.cells.filter((c) => c.id !== id));
  };
  const create = async (template?: string) => {
    setBusy("create");
    setError("");
    try {
      await saveNow();
      const value = await api<Document>("/notebooks", {
        title: template
          ? `${current.current?.title ?? "Notebook"} · copy`
          : "Untitled investigation",
        template,
      });
      update(value);
      setActive(value.notebook.cells[0]?.id ?? null);
      await refreshCatalog();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    setBusy("save");
    setError("");
    try {
      await saveNow();
      setNotice("Notebook saved locally.");
      setTimeout(() => setNotice(""), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const run = async (all = false) => {
    setError("");
    if (!current.current) return;
    if (!current.current.execution_enabled) {
      setError(
        "Enable the local kernel at startup: install .[notebooks] and launch ./scripts/dev.sh --notebooks",
      );
      return;
    }
    setBusy("run");
    try {
      let value = await saveNow();
      if (!value) return;
      const cells = all
        ? value.notebook.cells.filter((c) => c.cell_type === "code")
        : value.notebook.cells.filter(
            (c) => c.cell_type === "code" && c.id === active,
          );
      if (!cells.length) {
        setError("Select a code cell to run.");
        return;
      }
      for (const cell of cells) {
        setActive(cell.id);
        setBusy(cell.id);
        value = await api<Document>(`/notebooks/${value.id}/run`, {
          cell_id: cell.id,
          revision: value.revision,
          timeout,
        });
        update(value);
        if (value.status === "error" && stopOnError) break;
      }
      void refreshCatalog();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const interrupt = async () => {
    if (doc)
      await api(`/notebooks/${doc.id}/interrupt`).catch((e) =>
        setError(e.message),
      );
  };
  const stop = async () => {
    if (!doc) return;
    try {
      await api(`/notebooks/${doc.id}/stop`);
      update({ ...current.current!, kernel_running: false }, isDirty.current);
      setNotice("Kernel stopped; variables cleared.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const importNotebook = async (file: File) => {
    setBusy("import");
    setError("");
    try {
      if (file.size > 4 * 1024 ** 2)
        throw new Error("Notebook must be at most 4 MiB.");
      const notebook = JSON.parse(await file.text()) as Book;
      if (notebook.nbformat !== 4 || !Array.isArray(notebook.cells))
        throw new Error("Expected a version 4 .ipynb notebook.");
      notebook.cells = notebook.cells.map((c) => ({
        ...c,
        id: c.id ?? crypto.randomUUID(),
        source: plain(c.source),
        ...(c.cell_type === "code"
          ? { outputs: [], execution_count: null }
          : {}),
      }));
      await saveNow();
      const value = await api<Document>("/notebooks", {
        title: file.name.replace(/\.ipynb$/, ""),
      });
      const saved = await api<Document>(
        `/notebooks/${value.id}`,
        { revision: value.revision, notebook },
        "PUT",
      );
      update(saved);
      setActive(saved.notebook.cells[0]?.id ?? null);
      await refreshCatalog();
      setNotice("Imported without executing code. Saved outputs were cleared.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className="notebook-intro">
        <div>
          <Tag tone="purple">INTEGRATED PYTHON WORKSPACE</Tag>
          <p>Read the mathematics. Change a parameter. Run the experiment.</p>
        </div>
        <div className="inline-controls">
          <button
            className="secondary"
            disabled={!!busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} />
            Import .ipynb
          </button>
          <input
            hidden
            ref={fileRef}
            type="file"
            accept=".ipynb,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importNotebook(f);
              e.target.value = "";
            }}
          />
          <button
            className="primary"
            disabled={!!busy}
            onClick={() => create()}
          >
            <FilePlus2 size={14} />
            New notebook
          </button>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <IconButton
            label="Dismiss notebook error"
            onClick={() => setError("")}
          >
            <X size={14} />
          </IconButton>
        </div>
      )}
      {notice && (
        <div className="success-notice" role="status">
          <Check size={14} />
          {notice}
          <button onClick={() => setNotice("")}>
            <X size={12} />
          </button>
        </div>
      )}
      <div className={"notebook-layout " + (!rail ? "rail-collapsed" : "")}>
        <aside className="notebook-rail">
          <div className="notebook-rail-title">
            <BookOpen size={15} />
            <span>LAB NOTEBOOKS</span>
            <Tag tone="gray">{catalog?.notebooks.length ?? 0}</Tag>
          </div>
          {catalog?.notebooks.map((n) => (
            <button
              className={doc?.id === n.id ? "selected" : ""}
              key={n.id}
              disabled={!!busy}
              onClick={() => load(n.id)}
            >
              <span className="notebook-file-icon">
                <BookOpen size={15} />
              </span>
              <div>
                <strong>{n.title}</strong>
                <small>
                  {n.cells} cells ·{" "}
                  {n.origin === "bundled"
                    ? "Learning template"
                    : "Saved workspace"}
                </small>
              </div>
              {doc?.id === n.id && <span className="live-dot" />}
            </button>
          ))}
          <div className="notebook-rail-foot">
            <Code2 size={17} />
            <p>
              Editable Python and Markdown. LaTeX mathematics. Matplotlib
              output. Your files stay local.
            </p>
            <span>Never auto-executes imported code.</span>
          </div>
        </aside>
        <section
          onKeyDown={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              event.key.toLowerCase() === "s"
            ) {
              event.preventDefault();
              if (!busy) void save();
            }
            if (
              (event.shiftKey || event.metaKey || event.ctrlKey) &&
              event.key === "Enter"
            ) {
              event.preventDefault();
              if (!busy) void run();
            }
          }}
          className={"notebook-editor " + (busy ? "is-running" : "")}
        >
          <div className="notebook-toolbar">
            <IconButton
              label={rail ? "Hide notebook list" : "Show notebook list"}
              onClick={() => setRail((v) => !v)}
            >
              <FolderOpen size={16} />
            </IconButton>
            <div className="notebook-title">
              <input
                aria-label="Notebook title"
                value={String(
                  doc?.notebook.metadata.title ?? doc?.title ?? "Loading…",
                )}
                disabled={!doc || !!busy}
                onChange={(e) => {
                  if (doc)
                    update(
                      {
                        ...doc,
                        title: e.target.value,
                        notebook: {
                          ...doc.notebook,
                          metadata: {
                            ...doc.notebook.metadata,
                            title: e.target.value,
                          },
                        },
                      },
                      true,
                    );
                }}
              />
              <span>
                {dirty
                  ? "Unsaved changes"
                  : doc
                    ? "All changes saved"
                    : "Opening workspace"}
              </span>
            </div>
            <div className="notebook-actions">
              <button
                className="secondary"
                disabled={!doc || !!busy || !dirty}
                onClick={save}
              >
                <Save size={13} />
                <span>Save</span>
              </button>
              <IconButton
                label="Download notebook"
                onClick={() => {
                  if (doc) download(doc.notebook, `${doc.id}.ipynb`);
                }}
              >
                <ArrowDownToLine size={15} />
              </IconButton>
              <IconButton
                label="Duplicate notebook"
                onClick={() => {
                  if (doc) void create(doc.id);
                }}
              >
                <Copy size={15} />
              </IconButton>
            </div>
          </div>
          <div className="kernel-toolbar">
            <div className="kernel-state">
              <span
                className={doc?.kernel_running ? "live-dot" : "kernel-off"}
              />
              <span>Python 3</span>
              <Tag tone={doc?.execution_enabled ? "green" : "gray"}>
                {busy
                  ? "BUSY"
                  : doc?.kernel_running
                    ? "KERNEL READY"
                    : doc?.execution_enabled
                      ? "KERNEL IDLE"
                      : "EXECUTION OFF"}
              </Tag>
            </div>
            <div className="kernel-actions">
              <label>
                Timeout
                <select
                  value={timeout}
                  aria-label="Cell timeout"
                  onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
                >
                  {[10, 30, 60].map((t) => (
                    <option key={t} value={t}>
                      {t}s
                    </option>
                  ))}
                </select>
              </label>
              <label className="stop-error">
                <input
                  type="checkbox"
                  checked={stopOnError}
                  onChange={(e) => setStopOnError(e.target.checked)}
                />
                Stop on error
              </label>
              {busy ? (
                <button className="secondary" onClick={interrupt}>
                  <Square size={12} />
                  Interrupt
                </button>
              ) : (
                <>
                  <button
                    className="text-button"
                    disabled={!doc?.kernel_running}
                    onClick={stop}
                  >
                    <Square size={12} />
                    Stop kernel
                  </button>
                  <button
                    className="secondary"
                    disabled={!doc}
                    onClick={() => run(true)}
                  >
                    <Play size={12} />
                    Run all
                  </button>
                  <button
                    className="primary"
                    disabled={!doc}
                    onClick={() => run()}
                  >
                    <Play size={12} />
                    Run cell
                  </button>
                </>
              )}
            </div>
          </div>
          {!doc?.execution_enabled && (
            <div className="kernel-enable">
              <div>
                <Code2 size={18} />
                <div>
                  <strong>
                    A real Jupyter kernel, when you choose to enable it.
                  </strong>
                  <p>
                    Editing, saving and exporting work now. Enable trusted local
                    Python execution with:
                  </p>
                </div>
              </div>
              <Code>
                pip install -e '.[notebooks]' &amp;&amp; ./scripts/dev.sh
                --notebooks
              </Code>
            </div>
          )}
          <div className="notebook-cells">
            {doc?.notebook.cells.map((cell, index) => (
              <div
                key={cell.id}
                className={
                  "notebook-cell " +
                  (active === cell.id ? "active" : "") +
                  " " +
                  (busy === cell.id ? "executing" : "")
                }
                onClick={() => setActive(cell.id)}
              >
                <div className="cell-gutter">
                  {cell.cell_type === "code" ? (
                    <>
                      <span>
                        In [
                        {busy === cell.id ? "*" : (cell.execution_count ?? " ")}
                        ]
                      </span>
                      <button
                        aria-label={`Run cell ${index + 1}`}
                        disabled={!!busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActive(cell.id);
                          const value = current.current;
                          if (!value) return; // Select synchronously before the run callback reads the active cell.
                          void (async () => {
                            if (!value.execution_enabled) {
                              setError(
                                "Enable execution with ./scripts/dev.sh --notebooks",
                              );
                              return;
                            }
                            setBusy(cell.id);
                            setError("");
                            try {
                              const saved = await saveNow();
                              if (saved) {
                                const result = await api<Document>(
                                  `/notebooks/${saved.id}/run`,
                                  {
                                    cell_id: cell.id,
                                    revision: saved.revision,
                                    timeout,
                                  },
                                );
                                update(result);
                              }
                            } catch (error) {
                              setError((error as Error).message);
                            } finally {
                              setBusy(null);
                            }
                          })();
                        }}
                      >
                        {busy === cell.id ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          <Play size={13} />
                        )}
                      </button>
                    </>
                  ) : (
                    <span>md</span>
                  )}
                </div>
                <div className="cell-main">
                  <div className="cell-header">
                    <span>
                      <span className="cell-dot" />
                      {cell.cell_type === "code" ? "PYTHON" : "MARKDOWN"}{" "}
                      <small>{String(index + 1).padStart(2, "0")}</small>
                    </span>
                    <div className="cell-actions">
                      {cell.cell_type === "markdown" && (
                        <button
                          onClick={() =>
                            setEditingMarkdown(
                              editingMarkdown === cell.id ? null : cell.id,
                            )
                          }
                        >
                          {editingMarkdown === cell.id ? "Preview" : "Edit"}
                        </button>
                      )}
                      <IconButton
                        label={`Move cell ${index + 1} up`}
                        onClick={() => move(cell.id, -1)}
                      >
                        <ArrowUp size={12} />
                      </IconButton>
                      <IconButton
                        label={`Move cell ${index + 1} down`}
                        onClick={() => move(cell.id, 1)}
                      >
                        <ArrowDown size={12} />
                      </IconButton>
                      <IconButton
                        label={`Delete cell ${index + 1}`}
                        onClick={() => remove(cell.id)}
                      >
                        <Trash2 size={12} />
                      </IconButton>
                    </div>
                  </div>
                  {cell.cell_type === "code" || editingMarkdown === cell.id ? (
                    <CodeMirror
                      value={plain(cell.source)}
                      extensions={cell.cell_type === "code" ? [python()] : []}
                      theme={oneDark}
                      editable={!busy}
                      minHeight="65px"
                      basicSetup={{
                        lineNumbers: true,
                        foldGutter: true,
                        highlightActiveLine: true,
                        autocompletion: true,
                      }}
                      onChange={(source) => edit(cell.id, source)}
                      onFocus={() => setActive(cell.id)}
                    />
                  ) : (
                    <div onDoubleClick={() => setEditingMarkdown(cell.id)}>
                      <Markdown source={plain(cell.source)} />
                    </div>
                  )}
                  {cell.outputs?.length ? (
                    <div className="cell-outputs">
                      {cell.outputs.map((o, i) => (
                        <div
                          key={i}
                          className={
                            "cell-output " +
                            (o.output_type === "error" ? "output-error" : "")
                          }
                        >
                          {o.output_type === "stream" ? (
                            <pre>{stripAnsi(plain(o.text))}</pre>
                          ) : o.output_type === "error" ? (
                            <pre>
                              {stripAnsi(
                                o.traceback?.length
                                  ? o.traceback.join("\n")
                                  : `${o.ename}: ${o.evalue}`,
                              )}
                            </pre>
                          ) : o.data?.["image/png"] ? (
                            <img
                              alt={`Python plot from cell ${index + 1}`}
                              src={
                                "data:image/png;base64," +
                                plain(o.data["image/png"])
                              }
                            />
                          ) : (
                            <pre>
                              {stripAnsi(plain(o.data?.["text/plain"]))}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {!!cell.metadata.evidencelab && (
                    <div className="cell-timing">
                      <Check size={10} />
                      {(
                        cell.metadata.evidencelab as { elapsed_ms: number }
                      ).elapsed_ms.toFixed(0)}{" "}
                      ms ·{" "}
                      {(cell.metadata.evidencelab as { status: string }).status}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {doc && !doc.notebook.cells.length && (
              <Empty
                icon={BookOpen}
                title="Start with a question"
                text="Add a Python or Markdown cell to begin your investigation."
              />
            )}
          </div>
          <div className="add-cell-bar">
            <button
              disabled={!!busy || !doc}
              onClick={() => add("code", active ?? undefined)}
            >
              <Plus size={13} />
              Python cell
            </button>
            <button
              disabled={!!busy || !doc}
              onClick={() => add("markdown", active ?? undefined)}
            >
              <Text size={13} />
              Markdown cell
            </button>
            {deleted && (
              <button
                onClick={() => {
                  if (!current.current) return;
                  const cells = [...current.current.notebook.cells];
                  cells.splice(deleted.index, 0, deleted.cell);
                  modify(cells);
                  setDeleted(null);
                }}
              >
                <RotateCcw size={13} />
                Undo delete
              </button>
            )}
            <span>{doc?.notebook.cells.length ?? 0} cells · .ipynb</span>
          </div>
          <div className="notebook-trust">
            <Braces size={13} />
            {catalog?.execution_notice ??
              "Notebook code runs only when you explicitly request execution."}
          </div>
        </section>
      </div>
    </>
  );
}
