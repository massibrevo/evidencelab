import { GitCompareArrows } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { chartColors } from "./BenchmarkCharts";
import { Tag } from "./UI";
import type { CI } from "./types";
import type { Data } from "plotly.js";
const Plot = lazy(() => import("./Plot"));
export type CapabilityRun = {
  id: string;
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
    quantization?: string;
    max_length?: number;
  };
  rows: {
    task: string;
    metric: string;
    score: number;
    ci: CI | null;
    n: number;
    stderr: number | null;
  }[];
};
function protocol(run: CapabilityRun) {
  const c = run.config;
  return JSON.stringify([
    c.suite,
    c.limit,
    c.fewshot,
    c.seed,
    c.thinking,
    c.quantization ?? "none",
    c.max_length ?? 4096,
  ]);
}
export default function ModelCharts({ runs }: { runs: CapabilityRun[] }) {
  const [metric, setMetric] = useState("");
  const [task, setTask] = useState("all");
  const [type, setType] = useState("bar");
  const reference = runs[0];
  const matched = reference
    ? runs.filter((r) => protocol(r) === protocol(reference))
    : [];
  const options = Array.from(
    new Set(matched.flatMap((r) => r.rows.map((row) => row.metric))),
  );
  const chosen = options.includes(metric) ? metric : options[0];
  const tasks = Array.from(
    new Set(
      matched.flatMap((r) =>
        r.rows.filter((row) => row.metric === chosen).map((row) => row.task),
      ),
    ),
  );
  const selectedTask = task === "all" || tasks.includes(task) ? task : "all";
  const labels = selectedTask === "all" ? tasks.slice(0, 14) : [selectedTask];
  const chart: Data[] = matched.map((r, i) => {
    const rows = labels.map((task) =>
      r.rows.find((row) => row.task === task && row.metric === chosen),
    );
    return {
      type: type === "bar" ? "bar" : "scatter",
      mode: type === "bar" ? undefined : "markers",
      name:
        r.config.model_id.split("/")[1] +
        (r.config.adapter ? " + adapter" : ""),
      x: labels,
      y: rows.map((row) => row?.score ?? null),
      marker: { color: chartColors[i % chartColors.length], size: 11 },
      error_y: {
        type: "data",
        visible: true,
        symmetric: false,
        array: rows.map((row) =>
          row?.ci ? Math.max(0, row.ci.high - row.score) : 0,
        ),
        arrayminus: rows.map((row) =>
          row?.ci ? Math.max(0, row.score - row.ci.low) : 0,
        ),
        color: chartColors[i % chartColors.length],
        thickness: 1,
        width: 3,
      },
      hovertemplate: "%{x}<br>%{y:.3f}<extra>%{fullData.name}</extra>",
    };
  });
  if (!runs.length) return null;
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>
          <GitCompareArrows size={16} />
          Capability comparison
        </h2>
        <Tag tone="gray">{matched.length} MATCHED PROTOCOLS</Tag>
      </div>
      <div className="model-graph-controls">
        <label>
          Metric
          <select
            aria-label="Model chart metric"
            value={chosen}
            onChange={(e) => setMetric(e.target.value)}
          >
            {options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label>
          Task
          <select
            aria-label="Model chart task"
            value={selectedTask}
            onChange={(e) => setTask(e.target.value)}
          >
            <option value="all">First 14 tasks</option>
            {tasks.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          View
          <select
            aria-label="Model comparison view"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="bar">Grouped bars</option>
            <option value="dots">Dot comparison</option>
          </select>
        </label>
      </div>
      <div className="model-chart">
        <Suspense
          fallback={<div className="loading">Loading model comparison…</div>}
        >
          <Plot
            data={chart}
            layout={{
              barmode: "group",
              margin: { l: 45, r: 25, t: 40, b: 100 },
              legend: { orientation: "h", y: 1.18, font: { size: 9 } },
              xaxis: {
                gridcolor: "#29344c",
                tickangle: -30,
                tickfont: { size: 9 },
              },
              yaxis: {
                title: { text: chosen },
                range: [0, 1.08],
                gridcolor: "#29344c",
              },
            }}
          />
        </Suspense>
      </div>
      <div className="chart-provenance">
        <span className="live-dot" />
        Only matching suite, sample limit, few-shot count, seed, thinking,
        precision and context budget are overlaid. Intervals appear where
        recorded.
      </div>
      {matched.length < runs.length && (
        <div className="model-chart-warning">
          {runs.length - matched.length} recorded runs use a different protocol
          and are excluded from this overlay. Raw result tables remain available
          below.
        </div>
      )}
    </section>
  );
}
