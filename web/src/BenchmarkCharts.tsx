import {
  BarChart3,
  ChartScatter,
  Download,
  Grid2X2,
  Image,
  TableProperties,
} from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import type { Data, Layout } from "plotly.js";
import type { Benchmark } from "./types";
import { download } from "./types";
import { Tag } from "./UI";
const Plot = lazy(() => import("./Plot"));
export const chartColors = [
  "#a99bff",
  "#48d9cb",
  "#ffbd76",
  "#f48bb6",
  "#64b5ff",
];
export const chartPalette = {
  spectrum: chartColors,
  ocean: ["#5aaeff", "#58d9e2", "#8e91ff", "#b194ff", "#96d2ff"],
  accessible: ["#56B4E9", "#E69F00", "#009E73", "#CC79A7", "#0072B2"],
};
type Chart = "scores" | "latency" | "heatmap" | "tradeoff";
export default function BenchmarkCharts({
  run,
  compact = false,
}: {
  run: Benchmark;
  compact?: boolean;
}) {
  const [chart, setChart] = useState<Chart>("scores"),
    [metric, setMetric] = useState<"recall" | "mrr" | "ndcg">("recall"),
    [palette, setPalette] = useState<keyof typeof chartPalette>("spectrum"),
    [engine, setEngine] = useState<"interactive" | "matplotlib">("interactive"),
    [paper, setPaper] = useState(false),
    [errorBars, setErrorBars] = useState(true),
    [scale, setScale] = useState(false);
  const colors = chartPalette[palette];
  const data = useMemo<Data[]>(() => {
    const rows = run.rows;
    const names = rows.map((r) => r.mode.toUpperCase());
    if (chart === "scores")
      return (["recall", "mrr", "ndcg"] as const).map((key, i) => ({
        type: "bar",
        name: `${key.toUpperCase()}@${run.k}`,
        x: names,
        y: rows.map((r) => r.metrics[key].mean),
        marker: { color: colors[i], line: { width: 0 } },
        error_y: {
          type: "data",
          visible: errorBars,
          symmetric: false,
          array: rows.map((r) =>
            Math.max(0, r.metrics[key].high - r.metrics[key].mean),
          ),
          arrayminus: rows.map((r) =>
            Math.max(0, r.metrics[key].mean - r.metrics[key].low),
          ),
          color: "#c2cbe0",
          thickness: 1,
          width: 3,
        },
        hovertemplate: "%{x}<br>%{y:.3f}<extra>%{fullData.name}</extra>",
      }));
    if (chart === "latency")
      return rows.map((r, i) => ({
        type: "box",
        name: r.mode.toUpperCase(),
        y: r.queries.map((q) => q.latency_ms),
        boxpoints: "all",
        jitter: 0.25,
        pointpos: 0,
        marker: { color: colors[i % colors.length], size: 4, opacity: 0.5 },
        line: { color: colors[i % colors.length] },
        fillcolor: colors[i % colors.length] + "55",
        hovertemplate: "%{y:.2f} ms<extra>%{fullData.name}</extra>",
      }));
    if (chart === "heatmap") {
      const ids = rows[0].queries.map((q) => q.query_id);
      return [
        {
          type: "heatmap",
          x: ids.map((id) => `#${id}`),
          y: names,
          z: rows.map((r) => {
            const values = new Map(
              r.queries.map((q) => [q.query_id, q.metrics[metric]]),
            );
            return ids.map((id) => values.get(id) ?? null);
          }),
          zmin: 0,
          zmax: 1,
          colorscale: [
            [0, "#28243f"],
            [0.25, "#6c4bb1"],
            [0.6, "#6682c9"],
            [1, "#54d8c2"],
          ],
          colorbar: { thickness: 9, len: 0.8, tickfont: { size: 10 } },
          hovertemplate: "%{y}<br>Query %{x}<br>Score %{z:.3f}<extra></extra>",
        } as Data,
      ];
    }
    return rows.map((r, i) => ({
      type: "scatter",
      mode: "text+markers",
      name: r.mode.toUpperCase(),
      x: [r.latency_ms.median],
      y: [r.metrics[metric].mean],
      text: [r.mode.toUpperCase()],
      textposition: (i % 2 ? "bottom center" : "top center") as "top center",
      marker: {
        color: colors[i % colors.length],
        size: 14,
        line: { color: "#e5ecff", width: 1 },
      },
      error_y: {
        type: "data",
        visible: errorBars,
        symmetric: false,
        array: [Math.max(0, r.metrics[metric].high - r.metrics[metric].mean)],
        arrayminus: [
          Math.max(0, r.metrics[metric].mean - r.metrics[metric].low),
        ],
        color: colors[i % colors.length],
        thickness: 1,
      },
      hovertemplate:
        "Latency %{x:.2f} ms<br>Score %{y:.3f}<extra>%{fullData.name}</extra>",
    }));
  }, [run, chart, metric, colors, errorBars]);
  const layout: Partial<Layout> = {
    barmode: "group",
    bargap: 0.28,
    showlegend: chart === "scores",
    legend: { orientation: "h", y: 1.18, x: 0, font: { size: 10 } },
    margin: { l: chart === "heatmap" ? 95 : 50, r: 30, t: 45, b: 55 },
    xaxis: {
      gridcolor: "#29344c",
      zeroline: false,
      title: {
        text:
          chart === "tradeoff"
            ? "Median latency · ms"
            : chart === "heatmap"
              ? "Aligned query IDs"
              : "",
      },
      type: chart === "heatmap" ? "category" : chart === "tradeoff" && scale ? "log" : undefined,
    },
    yaxis: {
      gridcolor: "#29344c",
      zeroline: false,
      title: {
        text:
          chart === "latency"
            ? "Per-query latency · ms"
            : chart === "heatmap"
              ? ""
              : `${metric.toUpperCase()} / score`,
      },
      range: chart === "scores" || chart === "tradeoff" ? [0, 1.08] : undefined,
      type: chart === "latency" && scale ? "log" : undefined,
    },
    hoverlabel: { bgcolor: "#242d48", font: { color: "#eef2ff" } },
  };
  const query = `chart=${chart}&metric=${metric}&theme=${paper ? "paper" : "dark"}&palette=${palette}`;
  const figureBase = `/api/experiments/${encodeURIComponent(run.id)}/figure?${query}`;
  return (
    <section
      className={"panel benchmark-charts " + (compact ? "compact-charts" : "")}
    >
      <div className="panel-title">
        <h2>
          <BarChart3 size={16} />
          Experiment lens{" "}
          <Tag tone={run.provenance === "reference" ? "amber" : "green"}>
            {run.provenance === "reference"
              ? "PUBLISHED REFERENCE"
              : "MEASURED RUN"}
          </Tag>
        </h2>
        <div className="segmented" aria-label="Chart renderer">
          <button
            onClick={() => setEngine("interactive")}
            className={engine === "interactive" ? "selected" : ""}
          >
            Plotly
          </button>
          <button
            onClick={() => setEngine("matplotlib")}
            className={engine === "matplotlib" ? "selected" : ""}
          >
            Matplotlib
          </button>
        </div>
      </div>
      <div className="chart-toolbar">
        <div className="chart-tabs">
          {(
            [
              { id: "scores", label: "Score + CI", icon: BarChart3 },
              { id: "latency", label: "Latency", icon: TableProperties },
              { id: "heatmap", label: "Failures", icon: Grid2X2 },
              { id: "tradeoff", label: "Trade-offs", icon: ChartScatter },
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              className={chart === c.id ? "selected" : ""}
              onClick={() => setChart(c.id)}
            >
              <c.icon size={13} />
              {c.label}
            </button>
          ))}
        </div>
        <div className="chart-options">
          <select
            aria-label="Chart metric"
            value={metric}
            onChange={(e) => setMetric(e.target.value as typeof metric)}
          >
            <option value="recall">Recall</option>
            <option value="mrr">MRR</option>
            <option value="ndcg">nDCG</option>
          </select>
          <select
            aria-label="Chart palette"
            value={palette}
            onChange={(e) => setPalette(e.target.value as typeof palette)}
          >
            <option value="spectrum">Spectrum</option>
            <option value="ocean">Ocean</option>
            <option value="accessible">Accessible</option>
          </select>
        </div>
      </div>
      <div className="benchmark-plot">
        {engine === "interactive" ? (
          <Suspense
            fallback={
              <div className="loading">Loading interactive charts…</div>
            }
          >
            <Plot data={data} layout={layout} />
          </Suspense>
        ) : (
          <img
            src={figureBase + "&format=png"}
            alt={`Matplotlib ${chart} figure from measured benchmark ${run.id}`}
            className="matplotlib-figure"
          />
        )}
      </div>
      <div className="chart-bottom">
        <div className="chart-toggles">
          {engine === "interactive" ? (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={errorBars}
                  onChange={(e) => setErrorBars(e.target.checked)}
                />
                95% intervals
              </label>
              {(chart === "latency" || chart === "tradeoff") && (
                <label>
                  <input
                    type="checkbox"
                    checked={scale}
                    onChange={(e) => setScale(e.target.checked)}
                  />
                  Log latency
                </label>
              )}
            </>
          ) : (
            <label>
              <input
                type="checkbox"
                checked={paper}
                onChange={(e) => setPaper(e.target.checked)}
              />
              Paper background
            </label>
          )}
        </div>
        <div className="export-buttons">
          <span>
            <Download size={12} />
            Export
          </span>
          {["png", "svg", "pdf"].map((format) => (
            <a
              key={format}
              href={`${figureBase}&format=${format}&download=true`}
              download
            >
              {format.toUpperCase()}
            </a>
          ))}
          <a href={`/api/experiments/${run.id}/csv`} download>
            CSV
          </a>
          <button onClick={() => download(run, `evidencelab-${run.id}.json`)}>
            JSON
          </button>
        </div>
      </div>
      <div className="chart-provenance">
        <span className="live-dot" />
        {run.query_count} selected dev claims · k={run.k} ·{" "}
        {run.resamples ?? 2000} bootstrap resamples · corpus{" "}
        {run.corpus_sha256.slice(0, 10)}
        <span>
          {run.provenance === "reference"
            ? "Measured on the original workstation; local latency may differ."
            : "Actual run records; source citation integrity is not entailment."}
        </span>
      </div>
    </section>
  );
}
