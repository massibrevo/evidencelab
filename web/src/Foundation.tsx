import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  Copy,
  FlaskConical,
  Globe2,
  GraduationCap,
  Languages,
  Loader2,
  RefreshCw,
  Sigma,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CI } from "./types";
import { api, download } from "./types";
type ModelRun = {
  id: string;
  created: string;
  config: {
    suite: string;
    model_id: string;
    adapter: string | null;
    limit: number | null;
    fewshot: number;
    seed: number;
    thinking: boolean;
    scope: string;
    resolved_model_commit: string | null;
  };
  rows: {
    task: string;
    metric: string;
    score: number;
    ci: CI | null;
    n: number;
    stderr: number | null;
  }[];
  elapsed_seconds: number;
  peak_vram_gb: number | null;
};
type Registry = {
  suites: Record<
    string,
    { tasks: string[]; fewshot: number; description: string }
  >;
  runs: ModelRun[];
};
const icons: Record<string, typeof Sigma> = {
  smoke: FlaskConical,
  math: Sigma,
  language: Languages,
  knowledge: GraduationCap,
  reasoning: BrainCircuit,
  multilingual: Globe2,
  general: BookOpen,
};
export default function Foundation() {
  const [data, setData] = useState<Registry | null>(null),
    [suite, setSuite] = useState("general"),
    [model, setModel] = useState("qwen-0.8b"),
    [limit, setLimit] = useState(10),
    [full, setFull] = useState(false),
    [fewshot, setFewshot] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const load = () => {
    setBusy(true);
    api<Registry>("/foundation")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  };
  useEffect(load, []);
  const command = `python scripts/benchmark_models.py --suite ${suite} --model ${model} --fewshot ${fewshot}${full ? "" : ` --limit ${limit}`} --output .evidencelab/foundation/${model}-${suite}-${full ? "full" : "smoke"} --execute`;
  const runs = data?.runs.filter((r) => r.config.suite === suite) ?? [];
  return (
    <>
      <div className="capability-intro">
        <div>
          <span className="tag">FOUNDATION-MODEL EVALUATION</span>
          <h2>How capable is the model itself?</h2>
          <p>
            Benchmark raw model abilities separately from retrieval. Use the
            same task versions, prompt format, sample IDs, and compute settings
            for every comparison.
          </p>
        </div>
        <div className="capability-math">
          ∑<span>MEASURE · COMPARE · UNDERSTAND</span>
        </div>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="suite-grid">
        {Object.entries(data?.suites ?? {}).map(([id, s]) => {
          const Icon = icons[id] ?? FlaskConical;
          return (
            <button
              key={id}
              className={"suite-card " + (id === suite ? "chosen" : "")}
              onClick={() => setSuite(id)}
            >
              <div>
                <Icon size={20} />
                <span className="radio" />
              </div>
              <h3>
                {id === "general"
                  ? "Core capabilities"
                  : id[0].toUpperCase() + id.slice(1)}
              </h3>
              <p>{s.description}</p>
              <span className="suite-task-count">
                {s.tasks.length} task definitions
                <ArrowRight size={11} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="two-column">
        <section>
          <section className="panel">
            <div className="panel-title">
              <h2>
                Task manifest{" "}
                <span className="tag gray">{suite.toUpperCase()}</span>
              </h2>
              <span className="subtle-label">ELEUTHERAI LM-EVAL</span>
            </div>
            <div className="padded task-manifest">
              {data?.suites[suite]?.tasks.map((task, i) => (
                <div key={task}>
                  <span className="section-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{task}</strong>
                    <small>
                      {task.includes("gsm") || task.includes("math")
                        ? "Generated answers · task-specific exact-match extraction"
                        : "Task-specific accuracy · harness multiple-choice scoring"}
                    </small>
                  </div>
                  <span className="tag gray">{fewshot}-SHOT</span>
                </div>
              ))}
            </div>
            <div className="notice padded">
              <BookOpen size={15} />
              <p>
                Each task has its own scoring convention. These are local
                evaluation configurations, not replicas of model-card settings.
                Public test contamination remains possible; no arbitrary
                composite intelligence score is computed.
              </p>
            </div>
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Recorded model results</h2>
              <button className="text-button" onClick={load} disabled={busy}>
                {busy ? (
                  <Loader2 size={13} className="spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
                Refresh artifacts
              </button>
            </div>
            {!runs.length ? (
              <div className="empty">
                <div className="empty-icon">
                  <Sigma size={25} />
                </div>
                <h3>No model scores until a model actually runs.</h3>
                <p>
                  Execute a recipe in your terminal. This panel reads completed
                  local harness artifacts, including per-task scores and
                  uncertainty. Downloads and full evaluations are always
                  explicit.
                </p>
                <span className="tag gray">
                  No fabricated leaderboard entries
                </span>
              </div>
            ) : (
              runs.map((r) => (
                <div className="foundation-run" key={r.id}>
                  <div className="foundation-run-header">
                    <div>
                      <h3>
                        {r.config.model_id}
                        {r.config.adapter ? " + adapter" : ""}
                      </h3>
                      <p>
                        {r.config.scope} · {r.config.fewshot}-shot · seed{" "}
                        {r.config.seed} · thinking{" "}
                        {r.config.thinking ? "on" : "off"}
                      </p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="Export model benchmark"
                      onClick={() =>
                        download(r, `model-benchmark-${r.id}.json`)
                      }
                    >
                      <ArrowDownToLine size={15} />
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>TASK</th>
                          <th>METRIC</th>
                          <th>SCORE</th>
                          <th>95% CI</th>
                          <th>SAMPLES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.rows.map((row) => (
                          <tr key={row.task + row.metric}>
                            <td>
                              <strong>{row.task}</strong>
                            </td>
                            <td className="mono">{row.metric}</td>
                            <td className="metric-number">
                              {(row.score * 100).toFixed(1)}%
                            </td>
                            <td className="mono">
                              {row.ci
                                ? `${(row.ci.low * 100).toFixed(1)}–${(row.ci.high * 100).toFixed(1)}%`
                                : "not available"}
                            </td>
                            <td className="mono">{row.n || "group"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-footer">
                    {(r.elapsed_seconds / 60).toFixed(1)} min elapsed
                    <span>
                      Revision:{" "}
                      {r.config.resolved_model_commit?.slice(0, 10) ??
                        "unresolved"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </section>
        </section>
        <aside className="panel">
          <div className="panel-title">
            <h2>
              <Terminal size={15} />
              Benchmark recipe
            </h2>
            <span className="tag amber">OPT-IN</span>
          </div>
          <div className="padded settings">
            <label className="field-label">
              MODEL
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="qwen-0.8b">Qwen3.5 · 0.8B</option>
                <option value="qwen-4b">Qwen3.5 · 4B</option>
              </select>
            </label>
            <label className="field-label">
              FEW-SHOT EXAMPLES
              <input
                type="number"
                min="0"
                max="10"
                value={fewshot}
                onChange={(e) =>
                  setFewshot(Math.max(0, Number(e.target.value)))
                }
              />
            </label>
            <label className="switch-row">
              <span>
                Full evaluation
                <small>
                  {full
                    ? "All samples · potentially hours"
                    : "Limited run · validates the pipeline"}
                </small>
              </span>
              <input
                type="checkbox"
                checked={full}
                onChange={(e) => setFull(e.target.checked)}
              />
            </label>
            {!full && (
              <label className="field-label">
                SAMPLES PER TASK
                <input
                  type="number"
                  min="1"
                  value={limit}
                  onChange={(e) =>
                    setLimit(Math.max(1, Number(e.target.value)))
                  }
                />
              </label>
            )}
            <div className="code">
              <code>pip install -e '.[benchmark]'</code>
            </div>
            <div className="code">
              <code>{command}</code>
              <button
                className="icon-button"
                aria-label="Copy benchmark command"
                onClick={() => {
                  navigator.clipboard.writeText(command).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <button
              className="secondary full"
              onClick={() =>
                download(
                  {
                    suite,
                    model,
                    fewshot,
                    limit: full ? null : limit,
                    command,
                    status: "planned",
                  },
                  "model-benchmark-recipe.json",
                )
              }
            >
              <ArrowDownToLine size={14} />
              Export recipe
            </button>
            <p className="disclosure">
              Use a fresh output directory for each run. Add --adapter to
              compare fine-tuned weights. Omit --execute to print a plan without
              downloads.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
