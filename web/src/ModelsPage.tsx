import { Cpu, ExternalLink } from "lucide-react";
import { lazy } from "react";

import { Code, Tag } from "./UI";
import type { Overview } from "./types";
const Plot = lazy(() => import("./Plot"));
export default function ModelsPage({
  overview,
  online,
}: {
  overview: Overview | null;
  online: boolean;
}) {
  return (
    <>
      <div className="model-grid">
        {[
          {
            id: "qwen-4b",
            name: "Qwen3.5",
            size: "4B",
            tag: "PRIMARY FOUNDATION",
            description:
              "The main research configuration for local evidence-grounded generation.",
          },
          {
            id: "qwen-0.8b",
            name: "Qwen3.5",
            size: "0.8B",
            tag: "LIGHTWEIGHT EXPERIMENTS",
            description:
              "A smaller starting point for iteration, adapter experiments, and constrained hardware.",
          },
        ].map((m) => (
          <section className="panel model-card" key={m.id}>
            <div className="model-glyph">
              <Cpu size={25} />
              <Tag tone="gray">APACHE-2.0</Tag>
            </div>
            <span className="eyebrow">{m.tag}</span>
            <h2>
              {m.name}
              <span>{m.size}</span>
            </h2>
            <p>{m.description}</p>
            <div className="model-properties">
              <span>Open weights</span>
              <span>Text path</span>
              <span>PEFT adapters</span>
            </div>
            <Code>{`EVIDENCELAB_MODEL=${m.id} ./scripts/dev.sh`}</Code>
            <a
              className="text-button"
              href={`https://huggingface.co/Qwen/Qwen3.5-${m.size}`}
              target="_blank"
              rel="noreferrer"
            >
              Official model card
              <ExternalLink size={13} />
            </a>
          </section>
        ))}
      </div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-title">
            <h2>
              <Cpu size={15} />
              Local environment
            </h2>
            <Tag>{online ? "CONNECTED" : "OFFLINE"}</Tag>
          </div>
          <div className="padded metadata">
            <div>
              <span>Platform</span>
              <strong>
                {overview?.hardware.platform ?? "—"} ·{" "}
                {overview?.hardware.machine ?? "—"}
              </strong>
            </div>
            <div>
              <span>System memory</span>
              <strong>{overview?.hardware.ram_gb ?? "—"} GiB</strong>
            </div>
            <div>
              <span>Active answer engine</span>
              <strong>{overview?.engine ?? "—"}</strong>
            </div>
            <div>
              <span>Dense retrieval</span>
              <Tag tone={overview?.dense ? "green" : "gray"}>
                {overview?.dense ? "ENABLED" : "NOT LOADED"}
              </Tag>
            </div>
            <p className="muted">
              {overview?.hardware.note} Accelerator availability is probed only
              by the explicit CLI command.
            </p>
            <Code>evidencelab hardware --probe</Code>
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>Hardware-aware choices</h2>
          </div>
          <div className="padded">
            <div className="hardware-option">
              <span>APPLE SILICON</span>
              <h3>MPS · fp16 · LoRA</h3>
              <p>
                Unquantized inference and adapters where operators are
                supported. This project’s NF4 path requires NVIDIA CUDA.
              </p>
            </div>
            <div className="hardware-option">
              <span>NVIDIA GPU</span>
              <h3>CUDA · bf16 / NF4 · QLoRA</h3>
              <p>
                Optional bitsandbytes quantization reduces weight memory.
                Context and activation memory still matter.
              </p>
            </div>
            <p className="disclosure">
              Model downloads and GPU training are optional. Architecture
              integration is implemented; checkpoint performance is not claimed
              without an actual run.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
