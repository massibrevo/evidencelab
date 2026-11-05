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
  "#1f77b4",
  "#ff7f0e",
  "#87929d",
  "#456d94",
  "#d2a05a",
  "#667481",
];
export const chartPalette = {
  spectrum: chartColors,
  vivid: ["#12bfb4", "#ff7b58", "#ff9b05", "#8dcf27", "#497fd1"],
  muted: ["#597dbb", "#d58b5e", "#72b76a", "#c76e70", "#967bb1", "#87684c"],
  ocean: ["#2166ac", "#1b9eae", "#6488ca", "#7658a4", "#3b84a0"],
  accessible: ["#56B4E9", "#E69F00", "#009E73", "#CC79A7", "#0072B2"],
};
export function percentileGuides(values: number[]) {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b),
    grouped = new Map<string, { value: number; labels: string[] }>();
  for (const [label, q] of [
    ["P10", 0.1],
    ["P50", 0.5],
    ["P90", 0.9],
  ] as const) {
    const position = q * (sorted.length - 1),
      lower = Math.floor(position);
    const value =
      sorted[lower] +
      (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
    const key = value.toFixed(12),
      existing = grouped.get(key);
    if (existing) existing.labels.push(label);
    else grouped.set(key, { value, labels: [label] });
  }
  return [...grouped.values()].map((g) => ({
    value: g.value,
    label: g.labels.join(" / "),
  }));
}
type Chart = "scores" | "ranking" | "latency" | "heatmap" | "tradeoff";
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
    [paper, setPaper] = useState(true),
    [errorBars, setErrorBars] = useState(true),
    [values, setValues] = useState(true),
    [guides, setGuides] = useState(true),
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
        text: values
          ? rows.map((r) => r.metrics[key].mean.toFixed(3))
          : undefined,
        textposition: "outside",
        textfont: { color: "#253247", size: 11 },
        cliponaxis: false,
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
          color: "#627084",
          thickness: 1,
          width: 3,
        },
        hovertemplate: "%{x}<br>%{y:.3f}<extra>%{fullData.name}</extra>",
      }));
    if (chart === "ranking") {
      const ranked = [...rows].sort(
        (a, b) => b.metrics[metric].mean - a.metrics[metric].mean,
      );
      return [
        {
          type: "bar",
          x: ranked.map((r) => r.mode.toUpperCase()),
          y: ranked.map((r) => r.metrics[metric].mean),
          marker: { color: ranked.map((_, i) => colors[i % colors.length]) },
          text: values
            ? ranked.map((r) => r.metrics[metric].mean.toFixed(3))
            : undefined,
          textposition: "outside",
          textfont: { color: "#253247", size: 12 },
          cliponaxis: false,
          error_y: {
            type: "data",
            visible: errorBars,
            symmetric: false,
            color: "#627084",
            thickness: 1,
            width: 3,
            array: ranked.map((r) =>
              Math.max(0, r.metrics[metric].high - r.metrics[metric].mean),
            ),
            arrayminus: ranked.map((r) =>
              Math.max(0, r.metrics[metric].mean - r.metrics[metric].low),
            ),
          },
          hovertemplate: "%{x}<br>%{y:.3f}<extra></extra>",
        },
      ];
    }
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
            [0, "#f5f6f7"],
            [1, colors[0]],
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
        line: { color: "#ffffff", width: 1 },
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
  }, [run, chart, metric, colors, errorBars, values]);
  const guideValues =
    chart === "latency"
      ? run.rows.flatMap((r) => r.queries.map((q) => q.latency_ms))
      : run.rows.map((r) => r.metrics[metric].mean);
  const guideLines =
    guides && chart !== "heatmap" ? percentileGuides(guideValues) : [];
  const layout: Partial<Layout> = {
    barmode: "group",
    bargap: 0.28,
    showlegend: chart === "scores",
    legend: { orientation: "h", y: 1.18, x: 0, font: { size: 10 } },
    margin: { l: chart === "heatmap" ? 95 : 50, r: 30, t: 45, b: 55 },
    xaxis: {
      gridcolor: "#e5e7eb",
      zeroline: false,
      title: {
        text:
          chart === "tradeoff"
            ? "Median latency · ms"
            : chart === "heatmap"
              ? "Aligned query IDs"
              : "",
      },
      type:
        chart === "heatmap"
          ? "category"
          : chart === "tradeoff" && scale
            ? "log"
            : undefined,
    },
    yaxis: {
      gridcolor: "#e5e7eb",
      zeroline: false,
      title: {
        text:
          chart === "latency"
            ? "Per-query latency · ms"
            : chart === "heatmap"
              ? ""
              : chart === "scores"
                ? "Mean retrieval score"
                : `${metric.toUpperCase()}@${run.k}`,
      },
      range:
        chart === "scores" || chart === "ranking" || chart === "tradeoff"
          ? [0, 1.18]
          : undefined,
      type: chart === "latency" && scale ? "log" : undefined,
    },
    hoverlabel: {
      bgcolor: "#ffffff",
      bordercolor: "#cbd5e1",
      font: { color: "#253247" },
    },
    shapes: guideLines.map((g) => ({
      type: "line",
      xref: "paper",
      x0: 0,
      x1: 1,
      y0: g.value,
      y1: g.value,
      line: { color: "#32924b", dash: "dash", width: 1 },
    })),
    annotations: guideLines.map((g, i) => ({
      xref: "paper",
      yref: "y",
      x: 1,
      y: g.value,
      text: `${g.label} · ${g.value.toFixed(3)}${chart === "latency" ? " ms" : ""}`,
      showarrow: false,
      xanchor: "right",
      yanchor: "bottom",
      yshift: 3 + i * 12,
      font: { size: 10, color: "#26723b" },
      bgcolor: "rgba(255,255,255,0.9)",
    })),
  };
  const query = `chart=${chart}&metric=${metric}&theme=${paper ? "paper" : "dark"}&palette=${palette}&value_labels=${values}&guides=${guides}&intervals=${errorBars}`;
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
              { id: "ranking", label: "Ranked bars", icon: BarChart3 },
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
            <option value="spectrum">Jupyter</option>
            <option value="vivid">Teal + coral</option>
            <option value="muted">Muted research</option>
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
          {(chart === "scores" ||
            chart === "ranking" ||
            chart === "tradeoff") && (
            <label>
              <input
                type="checkbox"
                checked={errorBars}
                onChange={(e) => setErrorBars(e.target.checked)}
              />
              95% intervals
            </label>
          )}
          {chart !== "heatmap" && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={guides}
                  onChange={(e) => setGuides(e.target.checked)}
                />
                Dashed percentiles
              </label>
              {(chart === "scores" || chart === "ranking") && (
                <label>
                  <input
                    type="checkbox"
                    checked={values}
                    onChange={(e) => setValues(e.target.checked)}
                  />
                  Value labels
                </label>
              )}
            </>
          )}
          {engine === "interactive" ? (
            <>
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
      {guideLines.length > 0 && (
        <div className="guide-caption">
          Dashed P10 / P50 / P90: empirical percentiles of{" "}
          {chart === "latency"
            ? "pooled query latency"
            : `the ${run.rows.length} displayed method ${metric} means`}
          . These describe this run; they are not external performance targets.
        </div>
      )}
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
