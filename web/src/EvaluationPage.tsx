import { ArrowDownToLine, FlaskConical, Play, ShieldCheck } from "lucide-react";
import { lazy } from "react";

import { CIBar, Empty, IconButton, pct, Tag } from "./UI";
import type { Benchmark, Overview } from "./types";
import { download, modes } from "./types";
const Plot = lazy(() => import("./Plot"));
export default function EvaluationPage({
  overview,
  k,
  setK,
  seed,
  setSeed,
  busy,
  online,
  runBenchmark,
  benchmarks,
  currentBench,
  setSelectedBench,
}: {
  overview: Overview | null;
  k: number;
  setK: (value: number) => void;
  seed: number;
  setSeed: (value: number) => void;
  busy: string | null;
  online: boolean;
  runBenchmark: () => Promise<void>;
  benchmarks: Benchmark[];
  currentBench: Benchmark | undefined;
  setSelectedBench: (value: Benchmark | null) => void;
}) {
  return (
    <>
      <div className="evaluation-controls">
        <div>
          <Tag>RETRIEVAL BENCHMARK</Tag>
          <span>
            SciFact dev subset · {overview?.dataset.queries ?? 24} claims ·
            paper-level judgments
          </span>
        </div>
        <label>
          k{" "}
          <select value={k} onChange={(e) => setK(Number(e.target.value))}>
            {[1, 3, 4, 5, 10].map((n) => (
              <option value={n} key={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Seed{" "}
          <input
            aria-label="Bootstrap seed"
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
          />
        </label>
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>
            <FlaskConical size={16} />
            Benchmark leaderboard
          </h2>
          <div className="inline-controls">
            {benchmarks.length > 0 && (
              <select
                aria-label="Recorded benchmark"
                value={currentBench?.id}
                onChange={(e) =>
                  setSelectedBench(
                    benchmarks.find((b) => b.id === e.target.value) ?? null,
                  )
                }
              >
                {benchmarks.map((b, i) => (
                  <option value={b.id} key={b.id}>
                    Run {benchmarks.length - i} · k={b.k} ·{" "}
                    {new Date(b.created).toLocaleTimeString()}
                  </option>
                ))}
              </select>
            )}
            {currentBench && (
              <IconButton
                label="Export benchmark"
                onClick={() =>
                  download(currentBench, `benchmark-${currentBench.id}.json`)
                }
              >
                <ArrowDownToLine size={15} />
              </IconButton>
            )}
          </div>
        </div>
        {currentBench ? (
          <>
            <div className="table-scroll">
              <table className="benchmark-table">
                <thead>
                  <tr>
                    <th>RETRIEVAL STRATEGY</th>
                    <th>RECALL@{currentBench.k}</th>
                    <th>MRR@{currentBench.k}</th>
                    <th>nDCG@{currentBench.k}</th>
                    <th>95% CI · RECALL</th>
                    <th>MEDIAN / P95</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBench.rows.map((row, i) => (
                    <tr key={row.mode}>
                      <td>
                        <span className="rank-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <strong>
                          {modes.find((m) => m.id === row.mode)?.name ??
                            row.mode}
                        </strong>
                      </td>
                      <td className="metric-number">
                        {pct(row.metrics.recall.mean)}
                      </td>
                      <td className="mono">
                        {row.metrics.mrr.mean.toFixed(3)}
                      </td>
                      <td className="mono">
                        {row.metrics.ndcg.mean.toFixed(3)}
                      </td>
                      <td>
                        <CIBar value={row.metrics.recall} />
                      </td>
                      <td className="mono">
                        {row.latency_ms.median.toFixed(1)} /{" "}
                        {row.latency_ms.p95.toFixed(1)} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              Measured locally · {currentBench.query_count} queries · seed{" "}
              {currentBench.seed}
              <span>Percentile bootstrap · 2,000 resamples</span>
            </div>
          </>
        ) : (
          <Empty
            title="Results belong here. Assumptions don’t."
            text="Run the four retrieval strategies on the same real SciFact claims. Scores, per-query records, and confidence intervals are computed locally."
          >
            <button
              className="primary"
              disabled={!!busy || !online}
              onClick={runBenchmark}
            >
              <Play size={14} />
              Run first benchmark
            </button>
          </Empty>
        )}
      </section>
      {currentBench && (
        <div className="two-column">
          <section className="panel">
            <div className="panel-title">
              <h2>Paired comparisons</h2>
              <Tag tone="gray">Δ RECALL</Tag>
            </div>
            <div className="padded delta-list">
              {currentBench.paired.map((p) => (
                <div key={p.candidate}>
                  <div>
                    <strong>
                      {p.candidate} <span>vs {p.baseline}</span>
                    </strong>
                    <b>
                      {p.delta_recall.mean >= 0 ? "+" : ""}
                      {(p.delta_recall.mean * 100).toFixed(1)} pp
                    </b>
                  </div>
                  <p>
                    95% CI [{(p.delta_recall.low * 100).toFixed(1)},{" "}
                    {(p.delta_recall.high * 100).toFixed(1)}] pp ·{" "}
                    {p.delta_recall.low <= 0 && p.delta_recall.high >= 0
                      ? "Includes zero; improvement unresolved"
                      : "Excludes zero on this sample"}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Reproducibility record</h2>
              <ShieldCheck size={15} />
            </div>
            <div className="padded metadata">
              <div>
                <span>Corpus fingerprint</span>
                <code>{currentBench.corpus_sha256.slice(0, 20)}…</code>
              </div>
              <div>
                <span>Dataset</span>
                <strong>{currentBench.dataset}</strong>
              </div>
              <div>
                <span>Created</span>
                <strong>
                  {new Date(currentBench.created).toLocaleString()}
                </strong>
              </div>
              <div>
                <span>Human-annotated quality</span>
                <Tag tone="amber">NOT EVALUATED</Tag>
              </div>
            </div>
          </section>
        </div>
      )}
      <section className="panel">
        <div className="panel-title">
          <h2>Experimental protocol</h2>
          <span className="subtle-label">MEASURE WHAT YOU CLAIM</span>
        </div>
        <div className="protocol-grid">
          {[
            [
              "01",
              "Hold the data constant",
              "Identical queries and corpus across systems. Paper-level deduplication avoids inflated retrieval scores.",
            ],
            [
              "02",
              "Report uncertainty",
              "Paired bootstrap over query IDs. A small selected dev set supports debugging, not broad performance claims.",
            ],
            [
              "03",
              "Separate the signals",
              "Source integrity is not entailment. Accuracy, faithfulness, hallucination rate, and task success need independent labels.",
            ],
          ].map(([n, t, d]) => (
            <div key={n}>
              <span className="section-number">{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>
      {currentBench && (
        <section className="panel">
          <div className="panel-title">
            <h2>Query-level audit · {currentBench.rows[0].mode}</h2>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>CLAIM</th>
                  <th>RECALL</th>
                  <th>RECIPROCAL RANK</th>
                  <th>LATENCY</th>
                </tr>
              </thead>
              <tbody>
                {currentBench.rows[0].queries.map((q) => (
                  <tr key={q.query_id}>
                    <td>
                      <strong>{q.question}</strong>
                      <small className="block-muted">
                        #{q.query_id} · gold: {q.relevant.join(", ")}
                      </small>
                    </td>
                    <td className="mono">{pct(q.metrics.recall ?? 0)}</td>
                    <td className="mono">{(q.metrics.mrr ?? 0).toFixed(3)}</td>
                    <td className="mono">{q.latency_ms.toFixed(1)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
