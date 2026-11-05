import {
  ArrowDownToLine,
  GraduationCap,
  SlidersHorizontal,
} from "lucide-react";
import { lazy, Suspense } from "react";

import { Code, Empty, Tag } from "./UI";
import type { Training } from "./types";
import { download } from "./types";
const Plot = lazy(() => import("./Plot"));
export default function TrainingPage({
  training,
  model,
  setModel,
  quant,
  setQuant,
}: {
  training: Training[];
  model: string;
  setModel: (value: string) => void;
  quant: string;
  setQuant: (value: string) => void;
}) {
  return (
    <div className="two-column">
      <section>
        <section className="panel">
          <div className="panel-title">
            <h2>
              <SlidersHorizontal size={16} />
              Adapter experiments
            </h2>
            <Tag tone="amber">OPT-IN COMPUTE</Tag>
          </div>
          {training.length ? (
            <div className="training-results">
              {training.map((t) => (
                <div key={t.name}>
                  <div className="padded">
                    <h3>{t.name}</h3>
                    <p className="muted">
                      Real local training history · {t.history.length} log
                      events
                    </p>
                  </div>
                  <div className="training-plot">
                    <Suspense
                      fallback={<div className="loading">Loading chart…</div>}
                    >
                      <Plot
                        data={[
                          {
                            type: "scatter",
                            mode: "lines+markers",
                            name: "Training loss",
                            x: t.history
                              .filter((h) => h.loss !== undefined)
                              .map((h) => h.step),
                            y: t.history
                              .filter((h) => h.loss !== undefined)
                              .map((h) => h.loss),
                            line: { color: "#b4e8ab" },
                          },
                          {
                            type: "scatter",
                            mode: "lines+markers",
                            name: "Validation loss",
                            x: t.history
                              .filter((h) => h.eval_loss !== undefined)
                              .map((h) => h.step),
                            y: t.history
                              .filter((h) => h.eval_loss !== undefined)
                              .map((h) => h.eval_loss),
                            line: { color: "#cdb8e3" },
                          },
                        ]}
                        layout={{
                          xaxis: {
                            title: { text: "Optimizer steps" },
                            gridcolor: "#29332b",
                          },
                          yaxis: {
                            title: { text: "Cross-entropy loss" },
                            gridcolor: "#29332b",
                          },
                        }}
                      />
                    </Suspense>
                  </div>
                  <div className="padded">
                    <button
                      className="secondary"
                      onClick={() => download(t, `${t.name}.json`)}
                    >
                      <ArrowDownToLine size={14} />
                      Export training record
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={GraduationCap}
              title="A clean slate for your next experiment."
              text="No training has run. Prepare a document-disjoint dataset, inspect the configuration, then start LoRA explicitly from your terminal. Real loss curves will appear here."
            >
              <Tag tone="gray">No simulated training curves</Tag>
            </Empty>
          )}
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>Reproducible training path</h2>
          </div>
          <div className="padded">
            <div className="step-list">
              {[
                [
                  "01",
                  "Prepare upstream training data",
                  "Use the SciFact training split or QASPER train. Keep original dev/test out of model fitting.",
                ],
                [
                  "02",
                  "Split by paper, not by row",
                  "Seeded group splits prevent related claims about the same paper leaking across folds.",
                ],
                [
                  "03",
                  "Train and preserve the adapter",
                  "PEFT LoRA with TRL SFTTrainer. Save optimizer configuration, dataset fingerprints, model revision and log history.",
                ],
                [
                  "04",
                  "Evaluate against the base model",
                  "Run identical held-out questions with and without the adapter. Keep latency, retrieval and annotated answer quality separate.",
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
      </section>
      <aside>
        <section className="panel">
          <div className="panel-title">
            <h2>Experiment recipe</h2>
          </div>
          <div className="padded settings">
            <label className="field-label">
              FOUNDATION MODEL
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="qwen-0.8b">Qwen3.5 · 0.8B</option>
                <option value="qwen-4b">Qwen3.5 · 4B</option>
              </select>
            </label>
            <label className="field-label">
              ADAPTATION
              <select value={quant} onChange={(e) => setQuant(e.target.value)}>
                <option value="none">LoRA · full precision backbone</option>
                <option value="nf4">QLoRA · NF4 · NVIDIA CUDA</option>
              </select>
            </label>
            <div className="recipe-summary">
              <div>
                <span>Rank / alpha</span>
                <strong>16 / 32</strong>
              </div>
              <div>
                <span>Learning rate</span>
                <strong>2 × 10⁻⁴</strong>
              </div>
              <div>
                <span>Max sequence</span>
                <strong>1,024 tokens</strong>
              </div>
              <div>
                <span>Batch / accumulation</span>
                <strong>1 / 8</strong>
              </div>
            </div>
            <Code>
              pip install -e '.[{quant === "nf4" ? "qlora" : "train"}]'
            </Code>
            <Code>{`python scripts/train.py --dataset artifacts/splits --model ${model}${quant === "nf4" ? " --quantization nf4" : ""} --output .evidencelab/training/my-run`}</Code>
            <button
              className="secondary full"
              onClick={() =>
                download(
                  {
                    model,
                    quantization: quant,
                    rank: 16,
                    alpha: 32,
                    learning_rate: 2e-4,
                    max_length: 1024,
                    batch_size: 1,
                    gradient_accumulation_steps: 8,
                    seed: 42,
                    status: "recipe — not executed",
                  },
                  "training-recipe.json",
                )
              }
            >
              <ArrowDownToLine size={14} />
              Export recipe
            </button>
            <p className="disclosure">
              Terminal execution is required. The dashboard never starts a
              resource-intensive job.
            </p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>Beyond supervised tuning</h2>
          </div>
          <div className="padded">
            <Tag tone="gray">OPTIONAL EXPERIMENTS</Tag>
            <h3 className="mt">DPO & GRPO</h3>
            <p className="muted">
              Separate recipes require explicit preference data or verifiable
              reward labels. Citation formatting alone is not a sufficient
              research reward.
            </p>
            <Code>python scripts/preferences.py --help</Code>
          </div>
        </section>
      </aside>
    </div>
  );
}
