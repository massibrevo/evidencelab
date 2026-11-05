import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import BenchmarkCharts from "./BenchmarkCharts";
import ModelCharts from "./ModelCharts";
import type { Benchmark } from "./types";
vi.mock("./Plot", () => ({ default: () => <div>Recorded plot</div> }));
afterEach(cleanup);
const run = {
  id: "test-run",
  k: 3,
  seed: 42,
  query_count: 1,
  provenance: "reference",
  corpus_sha256: "abcd1234",
  rows: [
    {
      mode: "bm25",
      metrics: {
        recall: { mean: 1, low: 1, high: 1, n: 1 },
        mrr: { mean: 1, low: 1, high: 1, n: 1 },
        ndcg: { mean: 1, low: 1, high: 1, n: 1 },
      },
      queries: [
        {
          query_id: "1",
          metrics: { recall: 1, mrr: 1, ndcg: 1 },
          latency_ms: 1,
        },
      ],
      latency_ms: { median: 1, p95: 1 },
    },
  ],
} as unknown as Benchmark;
describe("Research chart controls", () => {
  it("labels reference data and exports the selected view", () => {
    render(<BenchmarkCharts run={run} />);
    expect(screen.getByText("PUBLISHED REFERENCE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Failures" }));
    const svg = screen.getByRole("link", { name: "SVG" });
    expect(svg).toHaveAttribute(
      "href",
      expect.stringContaining("chart=heatmap"),
    );
    expect(svg).toHaveAttribute("href", expect.stringContaining("format=svg"));
    fireEvent.click(screen.getByRole("button", { name: "Matplotlib" }));
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      expect.stringContaining("chart=heatmap"),
    );
  });
  it("does not overlay model runs using incompatible evaluation settings", () => {
    const config = {
      suite: "math",
      model_id: "Qwen/test",
      adapter: null,
      limit: 10,
      fewshot: 0,
      seed: 42,
      thinking: false,
      scope: "limited",
      resolved_model_commit: "abc",
    };
    render(
      <ModelCharts
        runs={[
          {
            id: "one",
            config,
            rows: [
              {
                task: "gsm8k",
                metric: "exact_match",
                score: 0.5,
                ci: null,
                n: 10,
                stderr: null,
              },
            ],
          },
          { id: "two", config: { ...config, limit: null }, rows: [] },
        ]}
      />,
    );
    expect(screen.getByText("1 MATCHED PROTOCOLS")).toBeInTheDocument();
    expect(
      screen.getByText(/1 recorded runs use a different protocol/),
    ).toBeInTheDocument();
  });
});
