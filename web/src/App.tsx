import AppearanceControls, { readAppearance } from "./Appearance";
import type { Appearance } from "./Appearance";

import { NotebookPen, ChartNoAxesCombined } from "lucide-react";
import type { BenchmarkOptions } from "./types";
import {
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Check,
  ChevronRight,
  ChevronsUpDown,
  CircleDot,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  FlaskConical,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  Network,
  PanelLeftClose,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import EvaluationPage from "./EvaluationPage";
import Flow from "./Flow";
import Foundation from "./Foundation";
import ModelsPage from "./ModelsPage";
import PapersPage from "./PapersPage";
import TrainingPage from "./TrainingPage";
import type {
  Answer,
  Benchmark,
  Evidence,
  Mode,
  Overview,
  Paper,
  Projection,
  Training,
} from "./types";
import { api, download, modes } from "./types";
import { Code, Empty, IconButton, MiniSpace, Tag } from "./UI";
const Plot = lazy(() => import("./Plot"));
const Observatory = lazy(() => import("./Observatory"));
const NotebookStudio = lazy(() => import("./NotebookStudio"));
const ConceptGraph = lazy(() => import("./ConceptGraph"));
type Page =
  | "observatory"
  | "notebooks"
  | "capabilities"
  | "workspace"
  | "papers"
  | "pipeline"
  | "vectors"
  | "agents"
  | "training"
  | "evaluation"
  | "models";
const titles: Record<Page, string> = {
  observatory: "Experiment observatory",
  notebooks: "Notebook studio",
  capabilities: "Model benchmarks",
  workspace: "Research workspace",
  papers: "Paper library",
  pipeline: "RAG pipeline",
  vectors: "Vector explorer",
  agents: "Agent studio",
  training: "Training studio",
  evaluation: "Evaluation lab",
  models: "Foundation models",
};
const groups = [
  {
    label: "RESEARCH",
    items: [
      ["workspace", LayoutDashboard, "Workspace"],
      ["papers", BookOpen, "Paper library"],
      ["pipeline", GitBranch, "RAG pipeline"],
      ["vectors", Boxes, "Vector explorer"],
      ["notebooks", NotebookPen, "Notebook studio"],
    ],
  },
  {
    label: "EXPERIMENTS",
    items: [
      ["observatory", ChartNoAxesCombined, "Observatory"],
      ["models", Cpu, "Foundation models"],
      ["agents", Network, "Agent studio"],
      ["training", SlidersHorizontal, "Fine-tuning"],
      ["evaluation", FlaskConical, "Retrieval benchmarks"],
      ["capabilities", GraduationCap, "Model benchmarks"],
    ],
  },
];
const colors: Record<string, string> = {
  retrieval: "#14b8a6",
  adaptation: "#9472b0",
  verification: "#ed9127",
  coordination: "#2684b7",
  biology: "#5481c2",
};
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function App() {
  const [page, setPage] = useState<Page>("workspace"),
    [overview, setOverview] = useState<Overview | null>(null),
    [papers, setPapers] = useState<Paper[]>([]),
    [projection, setProjection] = useState<Projection | null>(null),
    [answer, setAnswer] = useState<Answer | null>(null),
    [benchmarks, setBenchmarks] = useState<Benchmark[]>([]),
    [investigations, setInvestigations] = useState<Answer[]>([]),
    [training, setTraining] = useState<Training[]>([]);
  const [question, setQuestion] = useState(""),
    [mode, setMode] = useState<Mode>("hybrid"),
    [k, setK] = useState(4),
    [rewrite, setRewrite] = useState(true),
    [rerank, setRerank] = useState(false),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [online, setOnline] = useState(false),
    [showImport, setShowImport] = useState(false),
    [drawer, setDrawer] = useState<Paper | null>(null),
    [paperSearch, setPaperSearch] = useState(""),
    [command, setCommand] = useState(false),
    [commandSearch, setCommandSearch] = useState(""),
    [arch, setArch] = useState("supervisor"),
    [agentResult, setAgentResult] = useState<Answer | null>(null),
    [selectedBench, setSelectedBench] = useState<Benchmark | null>(null),
    [projectionMethod, setProjectionMethod] = useState("pca"),
    [model, setModel] = useState("qwen-0.8b"),
    [quant, setQuant] = useState("none"),
    [mobile, setMobile] = useState(false),
    [activeTab, setActiveTab] = useState("Answer"),
    [seed, setSeed] = useState(42);
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  const [benchmarkOptions, setBenchmarkOptions] = useState<BenchmarkOptions>({
    modes: ["bm25", "tfidf", "hybrid", "graph"],
    rewrite: false,
    rerank: false,
    resamples: 2000,
    architecture: null,
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        "evidencelab.appearance",
        JSON.stringify(appearance),
      );
    } catch {}
  }, [appearance]);
  const [sourceRange, setSourceRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  useEffect(() => {
    if (!drawer && !command && !showImport) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const candidates = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button, input, textarea, select, a[href], [tabindex="0"]',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));
    const first = candidates()[0];
    first?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = candidates();
      const start = nodes[0],
        end = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end?.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [drawer, command, showImport]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const refresh = useCallback(async () => {
    const [o, p, b, i, t] = await Promise.all([
      api<Overview>("/overview"),
      api<Paper[]>("/papers"),
      api<Benchmark[]>("/runs?kind=benchmark"),
      api<Answer[]>("/runs?kind=investigation"),
      api<Training[]>("/training"),
    ]);
    setOverview(o);
    setPapers(p);
    setBenchmarks(b);
    setInvestigations(i);
    setTraining(t);
    setOnline(true);
  }, []);
  useEffect(() => {
    refresh().catch((e) => {
      setError(`Local API unavailable. Start scripts/dev.sh. ${e.message}`);
      setOnline(false);
    });
    api<Projection>("/vectors")
      .then(setProjection)
      .catch(() => {});
  }, [refresh]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommand((x) => !x);
      }
      if (e.key === "Escape") {
        setCommand(false);
        setDrawer(null);
        setShowImport(false);
        setMobile(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const navigate = (next: Page) => {
    setPage(next);
    setMobile(false);
    setError("");
  };
  const openPaper = useCallback(
    (id: string, range?: { start: number; end: number }) => {
      setSourceRange(range ?? null);
      api<Paper>(`/papers/${encodeURIComponent(id)}`)
        .then(setDrawer)
        .catch((e) => setError(e.message));
    },
    [],
  );
  const execute = async (type: "query" | "agent" = "query") => {
    if (!question.trim()) {
      inputRef.current?.focus();
      return;
    }
    setBusy(type);
    setError("");
    try {
      const request = { question, mode, k, rewrite, rerank };
      if (type === "agent") {
        const result = await api<Answer>("/investigate", {
          ...request,
          architecture: arch,
          thread_id: "workstation",
        });
        setAgentResult(result);
        setInvestigations((old) => [result, ...old]);
      } else {
        setAnswer(await api<Answer>("/ask", request));
        setActiveTab("Answer");
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const runBenchmark = async () => {
    setBusy("benchmark");
    setError("");
    try {
      const b = await api<Benchmark>("/benchmarks", {
        ...benchmarkOptions,
        k,
        seed,
      });
      setSelectedBench(b);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const project = async (method: string) => {
    setBusy("projection");
    setError("");
    try {
      setProjection(await api<Projection>(`/vectors?method=${method}`));
      setProjectionMethod(method);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const currentBench = selectedBench ?? benchmarks[0];
  const settings = (
    <>
      <label className="field-label">
        RETRIEVAL STRATEGY
        <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          {modes.map((m) => (
            <option
              key={m.id}
              value={m.id}
              disabled={m.id === "dense" && !overview?.dense}
            >
              {m.name}
              {m.id === "dense" && !overview?.dense ? " · requires model" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        CONTEXT DOCUMENTS <span className="range-value">{k}</span>
        <input
          type="range"
          min="1"
          max="12"
          value={k}
          onChange={(e) => setK(Number(e.target.value))}
        />
      </label>
      <label className="switch-row">
        <span>
          Acronym expansion<small>Deterministic query rewriting</small>
        </span>
        <input
          type="checkbox"
          checked={rewrite}
          onChange={(e) => setRewrite(e.target.checked)}
        />
      </label>
      <label className="switch-row">
        <span>
          Neural reranking
          <small>
            {overview?.dense
              ? "Cross-encoder · first call downloads weights"
              : "Enable the optional dense backend first"}
          </small>
        </span>
        <input
          type="checkbox"
          checked={rerank}
          disabled={!overview?.dense}
          onChange={(e) => setRerank(e.target.checked)}
        />
      </label>
    </>
  );
  const queryBox = (agent = false) => (
    <div className="query-box">
      <div className="query-title">
        <Sparkles size={16} />
        <span>
          {agent ? "Start an investigation" : "Ask your research corpus"}
        </span>
        <Tag tone="gray">{agent ? arch : "Evidence grounded"}</Tag>
      </div>
      <textarea
        ref={inputRef}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void execute(agent ? "agent" : "query");
          }
        }}
        placeholder={
          agent
            ? "Compare the evidence for a scientific claim…"
            : "Ask a question or investigate a scientific claim…"
        }
        aria-label="Research question"
      />
      <div className="query-bottom">
        <div className="query-options">
          <select
            value={mode}
            aria-label="Retrieval mode"
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            {modes
              .filter((m) => m.id !== "dense" || overview?.dense)
              .map((m) => (
                <option value={m.id} key={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
          <span className="quiet-divider" />
          <span>
            <Database size={12} /> {k} sources
          </span>
        </div>
        <button
          className="primary"
          disabled={!!busy || !online}
          onClick={() => execute(agent ? "agent" : "query")}
        >
          {busy === (agent ? "agent" : "query") ? (
            <Loader2 className="spin" size={15} />
          ) : (
            <ArrowRight size={15} />
          )}{" "}
          {agent ? "Investigate" : "Run research"}
          <kbd>⌘ ↵</kbd>
        </button>
      </div>
    </div>
  );
  const renderAnswer = (result: Answer) => (
    <div className="answer-body">
      <div className="answer-meta">
        <Tag>
          <ShieldCheck size={11} /> Source linked
        </Tag>
        <span>{result.engine ?? "LangGraph workflow"}</span>
        {result.latency_ms !== undefined && (
          <span>{result.latency_ms.toFixed(0)} ms</span>
        )}
      </div>
      <div className="answer-text">
        {result.answer.split("\n\n").map((p, i) => (
          <p key={i}>
            {p.split(/(\[\d+\])/g).map((part, j) =>
              /^\[\d+\]$/.test(part) ? (
                <button
                  className="citation"
                  key={j}
                  onClick={() => {
                    const c = result.citations.find(
                      (c) => `[${c.number}]` === part,
                    );
                    if (c)
                      openPaper(c.paper_id, { start: c.start, end: c.end });
                  }}
                >
                  {part}
                </button>
              ) : (
                <span key={j}>{part}</span>
              ),
            )}
          </p>
        ))}
      </div>
      <div className="source-heading">
        {result.citations.length} CITED SOURCES{" "}
        <span>Verify against the original text</span>
      </div>
      <div className="source-grid">
        {result.citations.map((c) => (
          <button
            key={c.number}
            className="source-card"
            onClick={() =>
              openPaper(c.paper_id, { start: c.start, end: c.end })
            }
          >
            <span className="source-number">
              {String(c.number).padStart(2, "0")}
            </span>
            <div>
              <small>SCIENTIFIC EVIDENCE · #{c.paper_id}</small>
              <strong>{c.title}</strong>
              <span>
                Characters {c.start}–{c.end} <ArrowUpRight size={13} />
              </span>
            </div>
          </button>
        ))}
      </div>
      <p className="disclosure">
        {result.engine?.startsWith("extractive")
          ? "Source excerpts, selected by lexical overlap. No language model was used."
          : "Citation IDs and source offsets can be inspected. Semantic entailment has not been evaluated."}
      </p>
    </div>
  );
  return (
    <div
      data-density={appearance.density}
      className={"app " + (mobile ? "menu-open" : "")}
    >
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("workspace")}>
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            EvidenceLab
            <span className="brand-caption">OPEN RESEARCH SYSTEMS</span>
          </span>
        </button>
        <button className="project-switch" onClick={() => setCommand(true)}>
          <span className="project-avatar">
            <FlaskConical size={16} />
          </span>
          <span>
            Personal laboratory<small>Local workspace</small>
          </span>
          <ChevronsUpDown size={13} />
        </button>
        <nav>
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map(([id, Icon, label]) => {
                const NavIcon = Icon as typeof Activity;
                return (
                  <button
                    key={id as string}
                    className={page === id ? "nav-item active" : "nav-item"}
                    onClick={() => navigate(id as Page)}
                  >
                    <NavIcon size={17} />
                    <span>{label as string}</span>
                    {id === "papers" && (
                      <small>{overview?.papers ?? "—"}</small>
                    )}
                    {id === "evaluation" && <span className="tiny-dot" />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <div>
              <span className="live-dot" /> LOCAL-FIRST BY DESIGN
            </div>
            <p>
              Your papers. Your models.
              <br />
              Your machine.
            </p>
            <button onClick={() => navigate("models")}>
              View environment <ArrowUpRight size={13} />
            </button>
          </div>
          <a
            className="sidebar-link"
            href="https://github.com/massibrevo/evidencelab"
            target="_blank"
            rel="noreferrer"
          >
            <GitBranch size={15} />
            Open-source project
            <ArrowUpRight size={13} />
          </a>
          <div className="sidebar-version">
            <span className="avatar">EL</span>
            <span>
              EvidenceLab <small>Research preview · v0.2.0</small>
            </span>
            <IconButton
              label="Environment settings"
              onClick={() => navigate("models")}
            >
              <Settings2 size={15} />
            </IconButton>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <IconButton
              label="Toggle navigation"
              onClick={() => setMobile((x) => !x)}
            >
              <PanelLeftClose size={17} />
            </IconButton>
            <span className="crumb-divider" />
            <span>Laboratory</span>
            <ChevronRight size={13} />
            <strong>{titles[page]}</strong>
          </div>
          <div className="top-actions">
            <AppearanceControls value={appearance} onChange={setAppearance} />
            <span className={"system-status " + (!online ? "offline" : "")}>
              <span className="live-dot" />
              {online ? "Local system online" : "Connecting to API"}
            </span>
            <button className="command-button" onClick={() => setCommand(true)}>
              <Search size={14} />
              <span>Search anything</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="top-avatar">EL</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="small-line" /> THE OPEN-SOURCE LLM ENGINEERING
                LAB
              </div>
              <h1>
                {titles[page]}
                <span className="heading-period">.</span>
              </h1>
              <p>
                {
                  {
                    observatory:
                      "Inspect real experiment quality, runtime signals and agent work in one research instrument panel.",
                    notebooks:
                      "An integrated Python and Markdown workspace. Read, edit, execute, and export local experiments.",
                    capabilities:
                      "Math, language, knowledge, and reasoning. Benchmark the model beyond retrieval.",
                    workspace:
                      "From scientific papers to verifiable answers. Keep the evidence in view.",
                    papers:
                      "A traceable knowledge base. Every document stays on your machine.",
                    pipeline:
                      "Inspect each step between a question and its supporting evidence.",
                    vectors:
                      "Look inside the representation. Explore what your retriever sees.",
                    agents:
                      "Compose research workflows. Follow every tool call and handoff.",
                    training:
                      "Adapt deliberately. Track the data, the parameters, and the trade-offs.",
                    evaluation:
                      "Make a change. Run the comparison. Let the measurements speak.",
                    models:
                      "Open weights. Local inference. Explicit resource trade-offs.",
                  }[page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {page === "evaluation" ? (
                <button
                  className="primary"
                  disabled={!!busy || !online}
                  onClick={runBenchmark}
                >
                  {busy === "benchmark" ? (
                    <Loader2 className="spin" size={15} />
                  ) : (
                    <Play size={14} />
                  )}
                  Run benchmark
                </button>
              ) : (
                <button
                  className="secondary"
                  onClick={() => setShowImport(true)}
                >
                  <Plus size={15} />
                  Import paper
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              <CircleDot size={16} />
              <span>{error}</span>
              <IconButton label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </IconButton>
            </div>
          )}
          {(page === "workspace" || page === "papers") && (
            <div className="stat-grid">
              {[
                {
                  label: "INDEXED PAPERS",
                  value: overview?.papers,
                  unit: "documents",
                  icon: BookOpen,
                  foot: "SciFact + your imports",
                },
                {
                  label: "KNOWLEDGE CHUNKS",
                  value: overview?.chunks,
                  unit: "passages",
                  icon: Database,
                  foot: "Exact character provenance",
                },
                {
                  label: "ACTIVE ENGINE",
                  value: "Extractive",
                  unit: "CPU baseline",
                  icon: Cpu,
                  foot: overview?.engine.startsWith("extractive")
                    ? "No weights downloaded"
                    : (overview?.engine ?? "Awaiting API"),
                },
                {
                  label: "EXPERIMENT RUNS",
                  value: overview?.runs,
                  unit: "recorded",
                  icon: Activity,
                  foot: "Persisted locally in SQLite",
                },
              ].map((s, i) => (
                <div className="stat-card" key={s.label}>
                  <div className="stat-label">
                    {s.label}
                    <s.icon size={15} />
                  </div>
                  <div
                    className={"stat-value " + (i === 2 ? "text-value" : "")}
                  >
                    {i === 2 &&
                    !overview?.engine.startsWith("extractive") &&
                    overview?.engine
                      ? "Qwen"
                      : (s.value ?? "—")}
                    <span>{s.unit}</span>
                  </div>
                  <div className="stat-foot">
                    <span className={i === 2 ? "live-dot" : "stat-bullet"} />
                    {s.foot}
                  </div>
                </div>
              ))}
            </div>
          )}
          {page === "workspace" && (
            <>
              <div className="workspace-discovery">
                <div>
                  <span className="discovery-glyph">
                    <ChartNoAxesCombined size={20} />
                  </span>
                  <div>
                    <strong>Your research, with a wider field of view.</strong>
                    <span>
                      Inspect experiments, export Matplotlib figures, and work
                      directly in Python notebooks.
                    </span>
                  </div>
                </div>
                <div>
                  <button
                    className="secondary"
                    onClick={() => navigate("notebooks")}
                  >
                    <NotebookPen size={14} />
                    Notebook studio
                  </button>
                  <button
                    className="primary"
                    onClick={() => navigate("observatory")}
                  >
                    <ChartNoAxesCombined size={14} />
                    Open observatory
                  </button>
                </div>
              </div>
              <div className="workspace-grid">
                <section className="research-column">
                  <div className="section-title">
                    <h2>
                      <span className="section-number">01</span>Research desk
                    </h2>
                    <span className="subtle-label">
                      <span className="live-dot" /> READY TO INVESTIGATE
                    </span>
                  </div>
                  {queryBox()}
                  <div className="suggestions">
                    <span>TRY A DEMO CLAIM</span>
                    {overview?.questions.slice(0, 2).map((q, i) => (
                      <button
                        key={q.id}
                        onClick={() => {
                          setQuestion(q.question);
                          inputRef.current?.focus();
                        }}
                      >
                        {i === 0 ? (
                          <FlaskConical size={12} />
                        ) : (
                          <FileText size={12} />
                        )}
                        <span>{q.question}</span>
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                  </div>
                  <section className="panel evidence-panel">
                    <div className="panel-top">
                      <div className="tabs">
                        {["Answer", "Retrieved evidence", "Run details"].map(
                          (tab) => (
                            <button
                              className={activeTab === tab ? "selected" : ""}
                              key={tab}
                              onClick={() => setActiveTab(tab)}
                            >
                              {tab}
                              {tab === "Retrieved evidence" && answer && (
                                <span>{answer.evidence.length}</span>
                              )}
                            </button>
                          ),
                        )}
                      </div>
                      {answer && (
                        <IconButton
                          label="Export research run"
                          onClick={() =>
                            download(answer, `research-${answer.id}.json`)
                          }
                        >
                          <ArrowDownToLine size={15} />
                        </IconButton>
                      )}
                    </div>
                    {!answer ? (
                      <Empty
                        icon={ShieldCheck}
                        title="Good research starts with evidence."
                        text="Ask a question above to retrieve source passages, inspect citations, and build an answer you can verify."
                      >
                        <span className="empty-foot">
                          <span className="live-dot" />
                          {overview?.papers ?? "—"} papers ready · no API key
                          required
                        </span>
                      </Empty>
                    ) : activeTab === "Answer" ? (
                      renderAnswer(answer)
                    ) : activeTab === "Retrieved evidence" ? (
                      <div className="retrieved-list">
                        {answer.evidence.map((e, i) => (
                          <EvidenceRow
                            key={e.id}
                            evidence={e}
                            index={i}
                            onOpen={() => openPaper(e.paper_id)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="run-details">
                        <pre>
                          {JSON.stringify(
                            {
                              id: answer.id,
                              engine: answer.engine,
                              latency_ms: answer.latency_ms,
                              generated_tokens:
                                answer.generated_tokens ?? "not applicable",
                              citations: answer.citations.length,
                              created: answer.created,
                            },
                            null,
                            2,
                          )}
                        </pre>
                        <button
                          className="text-button"
                          onClick={() => download(answer, "research-run.json")}
                        >
                          Download complete artifact <ArrowDown size={13} />
                        </button>
                      </div>
                    )}
                  </section>
                </section>
                <aside className="right-column">
                  <section className="panel corpus-panel">
                    <div className="panel-title">
                      <h2>
                        <Database size={15} />
                        Connected corpus
                      </h2>
                      <Tag tone="gray">v1</Tag>
                    </div>
                    <div className="dataset-icon">
                      <span>SF</span>
                      <div>
                        <h3>SciFact</h3>
                        <p>Scientific claim verification</p>
                      </div>
                      <ShieldCheck size={17} />
                    </div>
                    <div className="corpus-meter">
                      <span />
                    </div>
                    <div className="corpus-numbers">
                      <span>{overview?.dataset.documents ?? "—"} papers</span>
                      <span>
                        {overview?.dataset.queries ?? "—"} evaluation claims
                      </span>
                    </div>
                    <div className="info-strip">
                      <span className="live-dot" />
                      Public dataset · attributed & versioned
                    </div>
                    <button
                      className="wide-link"
                      onClick={() => navigate("papers")}
                    >
                      Explore paper library
                      <ArrowUpRight size={14} />
                    </button>
                  </section>
                  <section className="panel">
                    <div className="panel-title">
                      <h2>
                        <Boxes size={15} />
                        Knowledge space
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => navigate("vectors")}
                      >
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <MiniSpace
                      projection={projection}
                      onClick={() => navigate("vectors")}
                    />
                    <div className="space-caption">
                      <span>
                        <i style={{ background: colors.biology }} />
                        Corpus chunks
                      </span>
                      <span>2D projection · seed 42</span>
                    </div>
                  </section>
                  <section className="notebook-callout">
                    <div className="notebook-glyph">
                      <GraduationCap size={20} />
                    </div>
                    <div>
                      <span>BUILT TO BE UNDERSTOOD</span>
                      <h3>Under the hood</h3>
                      <p>
                        Inspect retrieval mathematics and experimental
                        methodology.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => navigate("evaluation")}
                      >
                        Enter the evaluation lab
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </section>
                </aside>
              </div>
              <section className="panel pipeline-overview">
                <div className="panel-title">
                  <h2>
                    <GitBranch size={16} />
                    Your evidence pipeline <Tag tone="gray">BASELINE</Tag>
                  </h2>
                  <button
                    className="text-button"
                    onClick={() => navigate("pipeline")}
                  >
                    Configure pipeline
                    <ArrowUpRight size={14} />
                  </button>
                </div>
                <Flow dense={overview?.dense} />
                <div className="pipeline-caption">
                  <span>
                    <span className="live-dot" />5 inspectable stages
                  </span>
                  <span>
                    Local execution · exact source provenance · no hidden model
                    calls
                  </span>
                </div>
              </section>
            </>
          )}
          {page === "papers" && (
            <PapersPage
              papers={papers}
              paperSearch={paperSearch}
              setPaperSearch={setPaperSearch}
              openPaper={openPaper}
            />
          )}
          {page === "pipeline" && (
            <div className="two-column">
              <section>
                <section className="panel">
                  <div className="panel-title">
                    <h2>Retrieval architecture</h2>
                    <Tag>EDITABLE</Tag>
                  </div>
                  <Flow dense={overview?.dense} />
                  <div className="padded">
                    <p className="muted">
                      The baseline fuses two lexical rankings. Enable neural
                      retrieval to replace TF-IDF with SentenceTransformer
                      vectors in Qdrant. Drag nodes to inspect the layout;
                      retrieval controls are on the right.
                    </p>
                    <div className="step-list">
                      {[
                        [
                          "01",
                          "Chunk with provenance",
                          "Sentence-aware boundaries, 900 characters, 120-character overlap. Exact offsets into original text.",
                        ],
                        [
                          "02",
                          "Retrieve candidates",
                          "BM25 uses k₁=1.5 and b=0.75. TF-IDF uses sublinear term frequency and cosine similarity.",
                        ],
                        [
                          "03",
                          "Fuse the rankings",
                          "Reciprocal rank fusion with constant 60. Deduplicate by paper before selecting context.",
                        ],
                        [
                          "04",
                          "Inspect and answer",
                          "Extractive sentences by default. Optional local Qwen generates with citation IDs; inspect source support yourself.",
                        ],
                      ].map(([n, t, d]) => (
                        <div key={n}>
                          <span>{n}</span>
                          <div>
                            <h3>{t}</h3>
                            <p>{d}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-title">
                    <h2>Test this configuration</h2>
                  </div>
                  <div className="padded">
                    {queryBox()}
                    {answer && renderAnswer(answer)}
                  </div>
                </section>
              </section>
              <aside>
                <section className="panel">
                  <div className="panel-title">
                    <h2>
                      <Settings2 size={15} />
                      Pipeline controls
                    </h2>
                  </div>
                  <div className="padded settings">
                    {settings}
                    <div className="notice">
                      <GitBranch size={15} />
                      <p>
                        Graph mode adds heuristic concept co-occurrence scores.
                        It does not implement GraphRAG community summarization.
                      </p>
                    </div>
                    <Code>pip install -e '.[rag]'</Code>
                    <Code>EVIDENCELAB_DENSE=1 ./scripts/dev.sh</Code>
                  </div>
                </section>
              </aside>
            </div>
          )}
          {page === "vectors" && (
            <section className="panel">
              <div className="panel-title">
                <h2>
                  <Boxes size={16} />
                  Corpus representation{" "}
                  <Tag tone="gray">
                    {projection?.representation ?? "Loading"}
                  </Tag>
                </h2>
                <div className="segmented">
                  {["pca", "umap"].map((method) => (
                    <button
                      key={method}
                      disabled={!!busy}
                      className={projectionMethod === method ? "selected" : ""}
                      onClick={() => project(method)}
                    >
                      {method.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="vector-plot">
                <Suspense
                  fallback={
                    <div className="loading">
                      <Loader2 className="spin" />
                      Loading plotting engine…
                    </div>
                  }
                >
                  {projection && (
                    <Plot
                      data={Object.entries(colors).map(([group, color]) => ({
                        type: "scatter",
                        mode: "markers",
                        name: group,
                        x: projection.points
                          .filter((p) => p.group === group)
                          .map((p) => p.x),
                        y: projection.points
                          .filter((p) => p.group === group)
                          .map((p) => p.y),
                        text: projection.points
                          .filter((p) => p.group === group)
                          .map((p) => p.title),
                        customdata: projection.points
                          .filter((p) => p.group === group)
                          .map((p) => p.paper_id),
                        hovertemplate: "%{text}<extra></extra>",
                        marker: { color, size: 7, opacity: 0.8 },
                      }))}
                      layout={{
                        xaxis: {
                          title: {
                            text:
                              projectionMethod === "pca"
                                ? "Principal component 1"
                                : "UMAP 1",
                          },
                          gridcolor: "#e5e7eb",
                          zeroline: false,
                        },
                        yaxis: {
                          title: {
                            text:
                              projectionMethod === "pca"
                                ? "Principal component 2"
                                : "UMAP 2",
                          },
                          gridcolor: "#e5e7eb",
                          zeroline: false,
                        },
                        legend: { orientation: "h", y: -0.15 },
                        hoverlabel: {
                          bgcolor: "#233229",
                          font: { color: "#eee" },
                        },
                      }}
                      onClick={openPaper}
                    />
                  )}
                </Suspense>
              </div>
              <div className="plot-footer">
                <span>
                  <CircleDot size={13} />
                  Click a point to inspect its paper · drag to zoom ·
                  double-click to reset
                </span>
                <span>{projection?.points.length ?? 0} chunks</span>
              </div>
              <div className="notice padded">
                <ShieldCheck size={17} />
                <p>
                  Groups are heuristic topic labels, not learned clusters. A 2D
                  projection distorts distances and cannot establish retrieval
                  quality. UMAP requires the optional rag dependencies; PCA
                  works offline.
                </p>
              </div>
            </section>
          )}
          {page === "vectors" && (
            <Suspense
              fallback={<div className="loading">Building concept map…</div>}
            >
              <ConceptGraph onPaper={openPaper} />
            </Suspense>
          )}
          {page === "agents" && (
            <>
              <div className="architecture-grid">
                {[
                  {
                    id: "single",
                    title: "Single agent",
                    detail: "One retrieval → synthesis path",
                    icon: CircleDot,
                  },
                  {
                    id: "supervisor",
                    title: "Supervisor + workers",
                    detail: "Verify, reflect, and synthesize",
                    icon: Network,
                  },
                  {
                    id: "hierarchical",
                    title: "Hierarchical",
                    detail: "Analysis before verification",
                    icon: GitBranch,
                  },
                  {
                    id: "swarm",
                    title: "Dynamic routing",
                    detail: "Rule-routed worker handoffs",
                    icon: Boxes,
                  },
                ].map((a) => (
                  <button
                    key={a.id}
                    className={
                      "architecture-card " + (arch === a.id ? "chosen" : "")
                    }
                    onClick={() => {
                      setArch(a.id);
                      setAgentResult(null);
                    }}
                  >
                    <a.icon size={21} />
                    <span className="radio" />
                    <h3>{a.title}</h3>
                    <p>{a.detail}</p>
                  </button>
                ))}
              </div>
              <div className="two-column agent-columns">
                <section>
                  <section className="panel">
                    <div className="panel-title">
                      <h2>Orchestration graph</h2>
                      <Tag tone="gray">
                        {agentResult ? "EXECUTED TRACE" : "WORKFLOW TEMPLATE"}
                      </Tag>
                    </div>
                    <Flow
                      kind="agents"
                      architecture={arch}
                      trace={agentResult?.trace}
                    />
                    <div className="padded notice">
                      <GitBranch size={16} />
                      <p>
                        LangGraph executes typed shared state and bounded tool
                        calls. Routing is deterministic in this demo;
                        model-driven planning and emergent swarm behavior are
                        not claimed.
                      </p>
                    </div>
                  </section>
                  <div className="agent-query">{queryBox(true)}</div>
                  {agentResult && (
                    <section className="panel">
                      <div className="panel-title">
                        <h2>Research synthesis</h2>
                        <IconButton
                          label="Export investigation"
                          onClick={() =>
                            download(agentResult, "investigation.json")
                          }
                        >
                          <ArrowDownToLine size={15} />
                        </IconButton>
                      </div>
                      {renderAnswer(agentResult)}
                    </section>
                  )}
                </section>
                <aside className="panel trace-panel">
                  <div className="panel-title">
                    <h2>
                      <Activity size={15} />
                      Execution trace
                    </h2>
                    <Tag tone="gray">{agentResult?.trace?.length ?? 0}</Tag>
                  </div>
                  {agentResult?.trace ? (
                    <div className="trace-list">
                      {agentResult.trace.map((event, i) => (
                        <div key={i} className="trace-event">
                          <span className="trace-check">
                            <Check size={12} />
                          </span>
                          <div>
                            <div>
                              <strong>{event.node.replace("_", " ")}</strong>
                              <span>{event.elapsed_ms.toFixed(1)} ms</span>
                            </div>
                            <p>
                              {event.tool} · {event.evidence_count} evidence
                              passages
                            </p>
                            <details>
                              <summary>Inspect state update</summary>
                              <pre>{JSON.stringify(event.detail, null, 2)}</pre>
                            </details>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      icon={Network}
                      title="A trace for every decision"
                      text="Run an investigation to inspect actual node execution, source handoffs, and elapsed time."
                    />
                  )}
                  <div className="trace-history">
                    <h4>RECENT INVESTIGATIONS</h4>
                    {investigations.slice(0, 4).map((i) => (
                      <button
                        key={i.id}
                        onClick={() => {
                          setAgentResult(i);
                          setArch(i.architecture ?? "supervisor");
                          setQuestion(i.question);
                        }}
                      >
                        <span>{i.question}</span>
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                    {!investigations.length && (
                      <p>No recorded investigations yet.</p>
                    )}
                  </div>
                </aside>
              </div>
            </>
          )}
          {page === "evaluation" && (
            <EvaluationPage
              options={benchmarkOptions}
              onOptionsChange={setBenchmarkOptions}
              overview={overview}
              k={k}
              setK={setK}
              seed={seed}
              setSeed={setSeed}
              busy={busy}
              online={online}
              runBenchmark={runBenchmark}
              benchmarks={benchmarks}
              currentBench={currentBench}
              setSelectedBench={setSelectedBench}
            />
          )}
          {page === "observatory" && (
            <Suspense
              fallback={<div className="loading">Opening observatory…</div>}
            >
              <Observatory
                onBenchmark={() => navigate("evaluation")}
                onNotebook={() => navigate("notebooks")}
              />
            </Suspense>
          )}
          {page === "notebooks" && (
            <Suspense
              fallback={<div className="loading">Opening notebook studio…</div>}
            >
              <NotebookStudio />
            </Suspense>
          )}
          {page === "capabilities" && <Foundation />}
          {page === "training" && (
            <TrainingPage
              training={training}
              model={model}
              setModel={setModel}
              quant={quant}
              setQuant={setQuant}
            />
          )}
          {page === "models" && (
            <ModelsPage overview={overview} online={online} />
          )}
          <footer className="page-footer">
            <span>
              <span className="footer-symbol">✳</span>Evidence over intuition.
            </span>
            <span>
              LOCAL-FIRST <i /> REPRODUCIBLE <i /> OPEN SOURCE
            </span>
            <button onClick={() => navigate("evaluation")}>
              Inspect the methodology <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={async () => {
            setShowImport(false);
            await refresh();
            setProjection(await api<Projection>("/vectors"));
          }}
        />
      )}
      {drawer && (
        <div className="drawer-backdrop" onClick={() => setDrawer(null)}>
          <aside
            className="paper-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Paper evidence"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-heading">
              <span>
                <FileText size={16} />
                SOURCE INSPECTOR
              </span>
              <IconButton
                label="Close source inspector"
                onClick={() => setDrawer(null)}
              >
                <X size={20} />
              </IconButton>
            </div>
            <Tag tone="gray">
              {drawer.dataset} · #{drawer.id}
            </Tag>
            <h2>{drawer.title}</h2>
            <div className="drawer-metadata">
              <ShieldCheck size={14} />
              {drawer.license}
            </div>
            <a
              className="text-button"
              href={
                drawer.source.startsWith("https://")
                  ? drawer.source
                  : "https://github.com/allenai/scifact"
              }
              target="_blank"
              rel="noreferrer"
            >
              Source & attribution
              <ExternalLink size={13} />
            </a>
            <div className="source-heading">
              ORIGINAL EXTRACTED TEXT <span>Character offsets preserved</span>
            </div>
            <div className="paper-text">
              {sourceRange && drawer.text ? (
                <>
                  {drawer.text.slice(0, sourceRange.start)}
                  <mark className="source-highlight">
                    {drawer.text.slice(sourceRange.start, sourceRange.end)}
                  </mark>
                  {drawer.text.slice(sourceRange.end)}
                </>
              ) : (
                drawer.text
              )}
            </div>
            <div className="drawer-end">
              <Tag>
                <Check size={11} /> Locally stored
              </Tag>
              <button
                className="text-button"
                onClick={() => download(drawer, `paper-${drawer.id}.json`)}
              >
                Export source
                <ArrowDownToLine size={13} />
              </button>
            </div>
          </aside>
        </div>
      )}
      {command && (
        <div className="modal-backdrop" onClick={() => setCommand(false)}>
          <div
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search workspace"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="command-input">
              <Search size={18} />
              <input
                autoFocus
                placeholder="Search pages and papers…"
                value={commandSearch}
                onChange={(e) => setCommandSearch(e.target.value)}
              />
              <kbd>ESC</kbd>
            </div>
            <div className="command-results">
              <span className="nav-label">GO TO</span>
              {Object.entries(titles)
                .filter(([, title]) =>
                  title.toLowerCase().includes(commandSearch.toLowerCase()),
                )
                .map(([id, title]) => (
                  <button
                    key={id}
                    onClick={() => {
                      navigate(id as Page);
                      setCommand(false);
                    }}
                  >
                    <ArrowRight size={15} />
                    {title}
                    <ChevronRight size={13} />
                  </button>
                ))}
              {commandSearch.length > 1 && (
                <>
                  <span className="nav-label">PAPERS</span>
                  {papers
                    .filter((p) =>
                      p.title
                        .toLowerCase()
                        .includes(commandSearch.toLowerCase()),
                    )
                    .slice(0, 6)
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          openPaper(p.id);
                          setCommand(false);
                        }}
                      >
                        <FileText size={15} />
                        <span>{p.title}</span>
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                </>
              )}
            </div>
            <div className="command-footer">
              EvidenceLab command center<span>⌘ K to toggle</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function EvidenceRow({
  evidence: e,
  index,
  onOpen,
}: {
  evidence: Evidence;
  index: number;
  onOpen: () => void;
}) {
  return (
    <div className="evidence-row">
      <div>
        <Tag tone="gray">{String(index + 1).padStart(2, "0")}</Tag>
        <strong>{e.title}</strong>
        <IconButton label="Inspect source" onClick={onOpen}>
          <ArrowUpRight size={15} />
        </IconButton>
      </div>
      <p>{e.text}</p>
      <div className="evidence-scores">
        <span>Score {e.score.toFixed(4)}</span>
        <span>BM25 {e.bm25.toFixed(2)}</span>
        <span>TF-IDF {e.tfidf.toFixed(3)}</span>
        <span>
          chars {e.start}–{e.end}
        </span>
      </div>
    </div>
  );
}
function ImportModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const [tab, setTab] = useState("PDF"),
    [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [arxiv, setArxiv] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (tab === "PDF") {
        if (!file) throw new Error("Select a PDF first.");
        if (file.size > 20 * 1024 * 1024)
          throw new Error("PDF must be under 20 MiB.");
        const data = new FormData();
        data.append("file", file);
        const r = await fetch("/api/ingest/pdf", {
          method: "POST",
          body: data,
        });
        if (!r.ok) throw new Error((await r.json()).detail);
      } else if (tab === "Text") {
        await api("/ingest/text", { title, text });
      } else {
        await api("/ingest/arxiv", { identifier: arxiv.trim() });
      }
      await onSuccess();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="import-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Import paper"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-title">
          <h2>Bring your research into the lab</h2>
          <IconButton label="Close import" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <p className="muted">Extract, chunk, and index on this machine.</p>
        <div className="segmented">
          {["PDF", "Text", "arXiv"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={tab === t ? "selected" : ""}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "PDF" ? (
          <label
            className="upload-area"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setFile(e.dataTransfer.files[0] ?? null);
            }}
          >
            <Upload size={27} />
            <strong>{file ? file.name : "Drop a scientific paper here"}</strong>
            <span>or click to select · PDF · up to 20 MiB</span>
            <input
              type="file"
              accept="application/pdf"
              aria-label="Choose PDF"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : tab === "Text" ? (
          <div className="import-fields">
            <label className="field-label">
              PAPER TITLE
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A descriptive research title"
              />
            </label>
            <label className="field-label">
              SOURCE TEXT
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste source text (at least 20 characters)…"
              />
            </label>
          </div>
        ) : (
          <div className="import-fields">
            <label className="field-label">
              ARXIV IDENTIFIER
              <input
                autoFocus
                value={arxiv}
                onChange={(e) => setArxiv(e.target.value)}
                placeholder="2305.14314"
              />
            </label>
            <p className="muted">
              Fetches the PDF from arxiv.org. An internet connection is
              required; verify the paper’s reuse license before redistribution.
            </p>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="import-footer">
          <span>
            <ShieldCheck size={13} />
            No external model API
          </span>
          <button className="primary" disabled={busy} onClick={submit}>
            {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
            Index paper
          </button>
        </div>
      </div>
    </div>
  );
}
