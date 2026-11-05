import {
  Activity,
  ArrowRight,
  BookOpen,
  ChartNoAxesCombined,
  Cpu,
  Database,
  FlaskConical,
  RefreshCw,
  Timer,
  Workflow,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import BenchmarkCharts, { chartColors } from "./BenchmarkCharts";
import { api } from "./types";
import type { Analytics, Benchmark, ResourceSample } from "./types";
import { Empty, Tag } from "./UI";
const Plot = lazy(() => import("./Plot"));
export default function Observatory({
  onBenchmark,
  onNotebook,
}: {
  onBenchmark: () => void;
  onNotebook: () => void;
}) {
  const [data, setData] = useState<Analytics | null>(null),
    [experiments, setExperiments] = useState<Benchmark[]>([]),
    [selected, setSelected] = useState(""),
    [samples, setSamples] = useState<ResourceSample[]>([]),
    [live, setLive] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [a, b] = await Promise.all([
        api<Analytics>("/analytics"),
        api<Benchmark[]>("/experiments"),
      ]);
      setData(a);
      setExperiments(b);
      setSamples((old) => [...old, a.resources].slice(-60));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      api<ResourceSample>("/resources")
        .then((sample) => setSamples((old) => [...old, sample].slice(-60)))
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [live]);
  const run = experiments.find((r) => r.id === selected) ?? experiments[0];
  const resource = samples[samples.length - 1];
  return (
    <>
      <div className="observatory-banner">
        <div>
          <span className="eyebrow">INSTRUMENTS / MEASURED SYSTEMS</span>
          <h2>See the experiment. Follow the signal.</h2>
          <p>
            One place for retrieval quality, runtime behaviour and research
            provenance.
          </p>
        </div>
        <div className="banner-buttons">
          <button className="secondary" onClick={onNotebook}>
            <BookOpen size={14} />
            Open a notebook
          </button>
          <button className="primary" onClick={onBenchmark}>
            <FlaskConical size={14} />
            New experiment
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="observatory-kpis">
        {[
          {
            label: "LOCAL EXPERIMENTS",
            value: data
              ? Object.values(data.counts).reduce((a, b) => a + b, 0)
              : "—",
            caption: "All recorded queries, investigations and benchmarks",
            icon: FlaskConical,
          },
          {
            label: "RESPONSE P50 / P95",
            value: data?.latency
              ? `${data.latency.median.toFixed(1)} / ${data.latency.p95.toFixed(1)}`
              : "—",
            caption: "Milliseconds · recorded query requests",
            icon: Timer,
          },
          {
            label: "SOURCE-LINKED ANSWERS",
            value: data
              ? `${data.cited_answers} / ${data.answered + data.abstained}`
              : "—",
            caption: "Citation presence · not semantic correctness",
            icon: Database,
          },
          {
            label: "PROCESS MEMORY",
            value: resource ? `${resource.rss_mb.toFixed(0)} MB` : "—",
            caption: "Current process RSS · not GPU memory",
            icon: Cpu,
          },
        ].map((k, i) => (
          <div className={`observatory-kpi tone-${i}`} key={k.label}>
            <div>
              <span>{k.label}</span>
              <k.icon size={17} />
            </div>
            <strong>{k.value}</strong>
            <p>{k.caption}</p>
          </div>
        ))}
      </div>
      <div className="observatory-selector">
        <div>
          <ChartNoAxesCombined size={17} />
          <h2>Experiment observatory</h2>
          <Tag tone="gray">{experiments.length} available</Tag>
        </div>
        <div className="inline-controls">
          <select
            aria-label="Experiment record"
            value={run?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {experiments.map((r) => (
              <option value={r.id} key={r.id}>
                {r.label ?? `Local · k=${r.k}`}{" "}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label="Refresh observatory"
            onClick={refresh}
            disabled={busy}
          >
            <RefreshCw size={15} className={busy ? "spin" : ""} />
          </button>
        </div>
      </div>
      {run ? (
        <BenchmarkCharts run={run} />
      ) : (
        <section className="panel">
          <Empty
            icon={ChartNoAxesCombined}
            title="Measurements bring this view to life"
            text="Run a retrieval benchmark to create inspectable quality and latency charts."
          />
        </section>
      )}
      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-title">
            <h2>
              <Activity size={15} />
              Live resource monitor
            </h2>
            <label className="live-switch">
              <input
                type="checkbox"
                checked={live}
                onChange={(e) => setLive(e.target.checked)}
              />
              {live ? "Sampling every 4s" : "Paused"}
            </label>
          </div>
          <div className="resource-summary">
            <div>
              <strong>
                {resource?.available_memory_gb.toFixed(1) ?? "—"}
                <small>GiB available</small>
              </strong>
              <span>System RAM</span>
            </div>
            <div>
              <strong>
                {resource?.threads ?? "—"}
                <small>threads</small>
              </strong>
              <span>API process</span>
            </div>
            <div>
              <strong>
                {resource ? Math.floor(resource.uptime_seconds / 60) : "—"}
                <small>minutes</small>
              </strong>
              <span>Process uptime</span>
            </div>
          </div>
          <div className="resource-chart">
            <Suspense
              fallback={<div className="loading">Loading instruments…</div>}
            >
              <Plot
                data={[
                  {
                    type: "scatter",
                    mode: "lines+markers",
                    name: "Process RSS (MB)",
                    x: samples.map((s) => s.timestamp),
                    y: samples.map((s) => s.rss_mb),
                    line: { color: "#1f77b4", width: 2 },
                    marker: { size: 4 },
                    fill: "tozeroy",
                    fillcolor: "#1f77b415",
                  },
                  {
                    type: "scatter",
                    mode: "lines",
                    name: "System RAM (%)",
                    x: samples.map((s) => s.timestamp),
                    y: samples.map((s) => s.system_memory_percent),
                    yaxis: "y2",
                    line: { color: "#ff7f0e", width: 2 },
                  },
                ]}
                layout={{
                  margin: { l: 50, r: 45, t: 35, b: 45 },
                  legend: { orientation: "h", y: 1.2, font: { size: 9 } },
                  xaxis: { type: "date", gridcolor: "#e5e7eb" },
                  yaxis: {
                    title: { text: "RSS · MB" },
                    gridcolor: "#e5e7eb",
                    rangemode: "tozero",
                  },
                  yaxis2: {
                    title: { text: "RAM %" },
                    overlaying: "y",
                    side: "right",
                    range: [0, 100],
                    showgrid: false,
                  },
                }}
              />
            </Suspense>
          </div>
          <div className="instrument-caption">
            {samples.length} actual samples from this browser session · no
            historical data is fabricated.
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>
              <Workflow size={15} />
              Agent work distribution
            </h2>
            <Tag tone="gray">
              {data?.nodes.reduce((s, n) => s + n.calls, 0) ?? 0} node calls
            </Tag>
          </div>
          {data?.nodes.length ? (
            <div className="agent-timing-chart">
              <Suspense
                fallback={<div className="loading">Loading trace chart…</div>}
              >
                <Plot
                  data={[
                    {
                      type: "bar",
                      orientation: "h",
                      x: data.nodes.map((n) => n.total_ms),
                      y: data.nodes.map((n) => n.node.replace("_", " ")),
                      customdata: data.nodes.map(
                        (n) =>
                          `${n.calls} calls · mean ${n.mean_ms.toFixed(2)} ms`,
                      ),
                      marker: {
                        color: data.nodes.map(
                          (_, i) => chartColors[i % chartColors.length],
                        ),
                      },
                      hovertemplate:
                        "%{y}<br>%{x:.2f} ms total<br>%{customdata}<extra></extra>",
                    },
                  ]}
                  layout={{
                    margin: { l: 90, r: 25, t: 20, b: 45 },
                    xaxis: {
                      title: { text: "Total recorded node time · ms" },
                      gridcolor: "#e5e7eb",
                    },
                    yaxis: { autorange: "reversed", showgrid: false },
                  }}
                />
              </Suspense>
            </div>
          ) : (
            <Empty
              icon={Workflow}
              title="Trace the work, not the animation"
              text="Agent node timing appears after a real investigation. No synthetic handoff activity is shown."
            />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>Research activity</h2>
          <span className="subtle-label">
            LATEST {data?.window_size ?? 0} / 100 INSPECTED RECORDS
          </span>
        </div>
        {data?.activity.length ? (
          <div className="activity-list">
            {data.activity.map((a) => (
              <div key={a.id}>
                <span className={`activity-icon ${a.kind}`}>
                  <Activity size={14} />
                </span>
                <div>
                  <strong>{a.label}</strong>
                  <small>
                    {a.kind}
                    {a.architecture ? ` / ${a.architecture}` : ""} ·{" "}
                    {new Date(a.created).toLocaleString()}
                  </small>
                </div>
                {a.latency_ms != null && (
                  <code>{a.latency_ms.toFixed(1)} ms</code>
                )}
                <Tag tone="gray">Recorded</Tag>
              </div>
            ))}
          </div>
        ) : (
          <div className="padded muted">
            Your local activity will appear as you use the lab. Published
            references do not count as local runs.
          </div>
        )}
      </section>
      <p className="disclosure">{data?.limitations}</p>
    </>
  );
}
