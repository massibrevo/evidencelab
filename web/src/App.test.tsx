import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
vi.mock("./Flow", () => ({ default: () => <div>Inspectable workflow</div> }));
vi.mock("./Plot", () => ({ default: () => <div>Computed projection</div> }));
const overview = {
  papers: 108,
  chunks: 300,
  runs: 0,
  engine: "extractive · no language model",
  dense: false,
  hardware: { platform: "Darwin", machine: "arm64", ram_gb: 16, device: "cpu" },
  dataset: { name: "scifact-demo-v1", documents: 108, queries: 24 },
  models: {},
  questions: [
    { id: "1", question: "Scientific evidence improves verification." },
    { id: "2", question: "Protein expression changes cells." },
  ],
};
const paper = {
  id: "a",
  title: "A real source",
  source: "https://github.com/allenai/scifact",
  license: "ODC-By-1.0",
  dataset: "SciFact demo",
  characters: 20,
  text: "Verifiable evidence.",
};
let calls: { path: string; body: unknown }[] = [];
beforeEach(() => {
  calls = [];
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      const path = String(url);
      calls.push({
        path,
        body: options?.body ? JSON.parse(options.body as string) : undefined,
      });
      let value: unknown = [];
      if (path.endsWith("/hub/models")) value = { models: [
        { provider: "ollama", name: "gemma3:1b", quantization: "Q4_K_M" },
        { provider: "transformers", name: "TinyLlama/TinyLlama-1.1B-Chat-v1.0", format: "safetensors" },
      ], status: {}, actions: {} };
      if (path.endsWith("/hub/chat")) value = { text: "4", latency_ms: 35, tokens: 1 };
      if (path.endsWith("/overview")) value = overview;
      else if (path.endsWith("/papers")) value = [paper];
      else if (path.endsWith("/papers/a")) value = paper;
      else if (path.endsWith("/vectors"))
        value = { method: "pca", representation: "TF-IDF", points: [] };
      else if (path.endsWith("/ask"))
        value = {
          id: "run1",
          created: "2026-11-05T10:00:00Z",
          question: "Claim",
          answer: "Verifiable evidence. [1]",
          engine: "extractive · no language model",
          abstained: false,
          evidence: [],
          latency_ms: 5,
          citations: [
            {
              number: 1,
              paper_id: "a",
              chunk_id: "chunk1",
              title: paper.title,
              quote: paper.text,
              start: 0,
              end: 20,
              source: paper.source,
            },
          ],
        };
      else if (path.endsWith("/foundation"))
        value = {
          suites: {
            math: {
              tasks: ["gsm8k", "hendrycks_math"],
              fewshot: 0,
              description: "Arithmetic and mathematics",
            },
            general: {
              tasks: ["gsm8k"],
              fewshot: 0,
              description: "Core capability suite",
            },
          },
          runs: [],
        };
      return { ok: true, json: async () => value };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Research workstation", () => {
  it("runs a question and opens an exact source", async () => {
    render(<App />);
    await screen.findByText("Local system online");
    fireEvent.click(screen.getByRole("button", { name: "Research desk" }));
    fireEvent.change(screen.getByLabelText("Research question"), {
      target: { value: "What evidence supports this claim?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Run research/ }));
    await screen.findByText("Verifiable evidence.");
    expect(calls.find((c) => c.path.endsWith("/ask"))?.body).toMatchObject({
      question: "What evidence supports this claim?",
      mode: "hybrid",
      k: 4,
    });
    fireEvent.click(screen.getByRole("button", { name: "[1]" }));
    await screen.findByRole("dialog", { name: "Paper evidence" });
    expect(
      screen.getByText("Original extracted text", { exact: false }),
    ).toBeInTheDocument();
  });
  it("shows honest benchmark and training empty states", async () => {
    render(<App />);
    await screen.findByText("Local system online");
    fireEvent.click(
      screen.getByRole("button", { name: "Retrieval benchmarks" }),
    );
    expect(
      screen.getByText("Results belong here. Assumptions don’t."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Training curves" }));
    expect(
      screen.getByText("No simulated training curves"),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes("train/start"))).toBe(false);
  });
  it("filters papers and switches to broad model benchmarks", async () => {
    render(<App />);
    await screen.findByText("Local system online");
    fireEvent.click(screen.getByRole("button", { name: "Paper library 108" }));
    await screen.findByText("A real source");
    fireEvent.change(screen.getByLabelText("Filter papers"), {
      target: { value: "absent" },
    });
    expect(screen.getByText("No matching papers")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Model benchmarks" }));
    await screen.findByText("How capable is the model itself?");
    fireEvent.click(screen.getByRole("button", { name: /Math Arithmetic/ }));
    expect(screen.getByText("hendrycks_math")).toBeInTheDocument();
    expect(screen.getByText(/No model scores until/)).toBeInTheDocument();
  });
  it("keyboard command palette navigates without network mutations", async () => {
    render(<App />);
    await screen.findByText("Local system online");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(
      screen.getByRole("dialog", { name: "Search workspace" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Search workspace" }),
      ).not.toBeInTheDocument(),
    );
  });
  it("persists layout density without decorative theme controls", async () => {
    render(<App />);
    await screen.findByText("Local system online");
    expect(
      screen.queryByRole("button", { name: /colour theme/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use compact layout" }));
    expect(document.querySelector(".app")).toHaveAttribute(
      "data-density",
      "compact",
    );
    expect(
      JSON.parse(localStorage.getItem("evidencelab.appearance") ?? "{}")
        .density,
    ).toBe("compact");
  });
  it("opens on local chat and sends general prompts in the selected language", async () => {
    render(<App />);
    await screen.findByText("2 ready · 2 runtimes");
    fireEvent.click(screen.getByRole("button", { name: "Browse models" }));
    expect(screen.getAllByText("Not installed")).toHaveLength(3);
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter models" }), {
      target: { value: "tinyllama" },
    });
    expect(screen.queryByRole("button", { name: "Use Gemma 3" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use TinyLlama Chat" }));
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "it" } });
    fireEvent.change(screen.getByLabelText("Messaggio"), { target: { value: "2+2" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia" }));
    await screen.findByText("4");
    expect(calls.find(call => call.path.endsWith("/hub/chat"))?.body).toMatchObject({
      model: { provider: "transformers", name: "TinyLlama/TinyLlama-1.1B-Chat-v1.0" },
      language: "it", messages: [{ role: "user", content: "2+2" }],
    });
    expect(calls.some(call => call.path.endsWith("/ask"))).toBe(false);
  });
});
