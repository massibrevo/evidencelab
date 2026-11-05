"""Thread-serialized, headless Matplotlib exports from actual experiment records."""

import csv
import hashlib
import io
import json
import os
from collections import OrderedDict
from pathlib import Path
from threading import RLock

import numpy as np

os.environ.setdefault(
    "MPLCONFIGDIR", str(Path(os.environ.get("EVIDENCELAB_HOME", ".evidencelab")) / "cache/matplotlib")
)
FIGURE_LOCK = RLock()
FIGURE_CACHE: OrderedDict[tuple, bytes] = OrderedDict()
PALETTES = {
    "spectrum": ["#9d8dff", "#4bd6ca", "#ffb86c", "#f57eaf", "#6aafff"],
    "ocean": ["#56a8ff", "#5cd9d0", "#9bc7ff", "#8388ff", "#af8aff"],
    "accessible": ["#0072B2", "#E69F00", "#009E73", "#CC79A7", "#56B4E9"],
}


def render_benchmark(
    run: dict,
    chart: str = "scores",
    metric: str = "recall",
    fmt: str = "png",
    theme: str = "dark",
    palette: str = "spectrum",
) -> bytes:
    if chart not in {"scores", "latency", "heatmap", "tradeoff"} or metric not in {"recall", "mrr", "ndcg"}:
        raise ValueError("Unsupported figure or metric")
    if fmt not in {"png", "svg", "pdf"} or theme not in {"dark", "paper"} or palette not in PALETTES:
        raise ValueError("Unsupported figure export options")
    cache_key = (
        hashlib.sha256(json.dumps(run, sort_keys=True).encode()).hexdigest(),
        chart,
        metric,
        fmt,
        theme,
        palette,
    )
    with FIGURE_LOCK:
        if cache_key in FIGURE_CACHE:
            FIGURE_CACHE.move_to_end(cache_key)
            return FIGURE_CACHE[cache_key]
        from matplotlib.backends.backend_agg import FigureCanvasAgg
        from matplotlib.figure import Figure

        bg, ink, muted, grid = (
            ("#12182b", "#e9edff", "#9aa9c8", "#303b56")
            if theme == "dark"
            else ("#ffffff", "#17233e", "#51617b", "#e1e6ef")
        )
        colors = PALETTES[palette]
        fig = Figure(figsize=(11, 6.7), facecolor=bg, layout="constrained")
        FigureCanvasAgg(fig)
        ax = fig.subplots()
        ax.set_facecolor(bg)
        rows = run["rows"]
        labels = [r["mode"].upper() for r in rows]
        x = np.arange(len(rows))
        if chart == "scores":
            for j, key in enumerate(("recall", "mrr", "ndcg")):
                values = [r["metrics"][key]["mean"] for r in rows]
                lows = [max(0, v - r["metrics"][key]["low"]) for v, r in zip(values, rows)]
                highs = [max(0, r["metrics"][key]["high"] - v) for v, r in zip(values, rows)]
                ax.bar(
                    x + (j - 1) * 0.24,
                    values,
                    0.22,
                    color=colors[j],
                    label=f"{key.upper()}@{run['k']}",
                    yerr=[lows, highs],
                    capsize=3,
                    error_kw={"ecolor": muted, "linewidth": 0.8},
                )
            ax.set_xticks(x, labels)
            ax.set_ylim(0, 1.12)
            ax.set_ylabel("Mean score · 95% query bootstrap interval", color=muted)
            legend = ax.legend(frameon=False, labelcolor=ink, loc="upper right")
            legend.set_in_layout(True)
        elif chart == "latency":
            values = [[q["latency_ms"] for q in r["queries"]] for r in rows]
            boxes = ax.boxplot(
                values,
                patch_artist=True,
                tick_labels=labels,
                medianprops={"color": ink},
                boxprops={"linewidth": 0.8},
                whiskerprops={"color": muted},
                capprops={"color": muted},
                flierprops={"marker": ".", "markeredgecolor": muted},
            )
            for box, color in zip(boxes["boxes"], colors):
                box.set_facecolor(color)
                box.set_alpha(0.7)
            for i, samples in enumerate(values, 1):
                ax.scatter(
                    np.full(len(samples), i) + np.linspace(-0.12, 0.12, len(samples)),
                    samples,
                    s=10,
                    color=ink,
                    alpha=0.35,
                    zorder=3,
                )
            ax.set_ylabel("Warm retrieval + answer generation · milliseconds", color=muted)
        elif chart == "heatmap":
            query_ids = [q["query_id"] for q in rows[0]["queries"]]
            lookup = [{q["query_id"]: q["metrics"][metric] for q in r["queries"]} for r in rows]
            values = np.array([[r.get(q, np.nan) for q in query_ids] for r in lookup])
            image = ax.imshow(values, vmin=0, vmax=1, cmap="viridis", aspect="auto")
            ax.set_yticks(np.arange(len(labels)), labels)
            ax.set_xticks(np.arange(len(query_ids)), query_ids, rotation=65, fontsize=7)
            ax.set_xlabel("SciFact query ID · aligned across strategies", color=muted)
            bar = fig.colorbar(image, ax=ax, shrink=0.75)
            bar.ax.tick_params(colors=muted)
            bar.set_label(f"{metric.upper()}@{run['k']}", color=muted)
        else:
            for i, row in enumerate(rows):
                score = row["metrics"][metric]
                latency = row["latency_ms"]["median"]
                ax.errorbar(
                    latency,
                    score["mean"],
                    yerr=[[max(0, score["mean"] - score["low"])], [max(0, score["high"] - score["mean"])]],
                    fmt="o",
                    color=colors[i % len(colors)],
                    markersize=9,
                    capsize=4,
                )
                ax.annotate(
                    row["mode"].upper(),
                    (latency, score["mean"]),
                    xytext=(10, 10),
                    textcoords="offset points",
                    color=ink,
                    fontsize=9,
                )
            ax.set_xlabel("Median latency · milliseconds · lower is faster", color=muted)
            ax.set_ylabel(f"{metric.upper()}@{run['k']} · higher is better", color=muted)
            ax.set_ylim(0, 1.1)
            ax.margins(x=0.25)
        if chart != "heatmap":
            ax.grid(axis="y", color=grid, alpha=0.6, linewidth=0.6)
            ax.set_axisbelow(True)
        for spine in ax.spines.values():
            spine.set_color(grid)
        ax.tick_params(colors=muted)
        kind = "PUBLISHED REFERENCE" if run.get("provenance") == "reference" else "LOCAL MEASUREMENT"
        fig.suptitle(
            f"EvidenceLab / {chart.replace('_', ' ').title()}", color=ink, fontsize=18, x=0.04, ha="left"
        )
        ax.set_title(
            f"{kind} · {run['query_count']} queries · k={run['k']} · seed {run['seed']}",
            color=muted,
            fontsize=9,
            loc="left",
            pad=17,
        )
        fig.supxlabel(
            f"Selected SciFact dev subset · retrieval, not claim-verification accuracy\n"
            f"Corpus {run['corpus_sha256'][:16]} · run {run['id'][:12]}",
            color=muted,
            fontsize=8,
        )
        output = io.BytesIO()
        fig.savefig(output, format=fmt, dpi=180, facecolor=bg, metadata={"Creator": "EvidenceLab"})
        fig.clear()
        result = output.getvalue()
        FIGURE_CACHE[cache_key] = result
        while len(FIGURE_CACHE) > 24:
            FIGURE_CACHE.popitem(last=False)
        return result


def benchmark_csv(run: dict) -> str:
    output = io.StringIO()
    fields = ["run_id", "mode", "query_id", "recall", "mrr", "ndcg", "latency_ms", "retrieved", "relevant"]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    for row in run["rows"]:
        for q in row["queries"]:
            writer.writerow(
                {
                    "run_id": run["id"],
                    "mode": row["mode"],
                    "query_id": q["query_id"],
                    **{m: q["metrics"][m] for m in ("recall", "mrr", "ndcg")},
                    "latency_ms": q["latency_ms"],
                    "retrieved": ";".join(q["retrieved"]),
                    "relevant": ";".join(q["relevant"]),
                }
            )
    return output.getvalue()
