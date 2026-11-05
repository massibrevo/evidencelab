import { SlidersHorizontal } from "lucide-react";
import type { BenchmarkOptions } from "./types";
import { modes } from "./types";
export default function BenchmarkControls({
  value,
  onChange,
  dense,
  busy,
}: {
  value: BenchmarkOptions;
  onChange: (value: BenchmarkOptions) => void;
  dense: boolean;
  busy: boolean;
}) {
  return (
    <details className="benchmark-controls" open>
      <summary>
        <SlidersHorizontal size={14} />
        Experiment configuration
        <span>
          {value.modes.length} strategies · {value.architecture ?? "retrieval"}{" "}
          · {value.resamples.toLocaleString()} resamples
        </span>
      </summary>
      <div className="benchmark-control-grid">
        <fieldset disabled={busy}>
          <legend>RETRIEVAL STRATEGIES</legend>
          <div className="strategy-checks">
            {modes.map((m) => (
              <label
                key={m.id}
                className={value.modes.includes(m.id) ? "chosen" : ""}
              >
                <input
                  type="checkbox"
                  checked={value.modes.includes(m.id)}
                  disabled={(m.id === "dense" && !dense) || busy}
                  onChange={(e) => {
                    const modes = e.target.checked
                      ? [...value.modes, m.id]
                      : value.modes.filter((x) => x !== m.id);
                    if (modes.length) onChange({ ...value, modes });
                  }}
                />
                <span>
                  {m.name}
                  <small>
                    {m.id === "dense" && !dense
                      ? "Optional backend required"
                      : m.detail}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="benchmark-extra-controls">
          <label className="field-label">
            WORKFLOW
            <select
              value={value.architecture ?? "retrieval"}
              disabled={busy}
              onChange={(e) =>
                onChange({
                  ...value,
                  architecture:
                    e.target.value === "retrieval" ? null : e.target.value,
                })
              }
            >
              <option value="retrieval">Retrieval → answer</option>
              <option value="single">Single agent</option>
              <option value="supervisor">Supervisor + workers</option>
              <option value="hierarchical">Hierarchical analysis</option>
              <option value="swarm">Dynamic routing</option>
            </select>
          </label>
          <label className="field-label">
            BOOTSTRAP RESAMPLES
            <select
              disabled={busy}
              value={value.resamples}
              onChange={(e) =>
                onChange({ ...value, resamples: Number(e.target.value) })
              }
            >
              {[500, 2000, 5000, 10000].map((n) => (
                <option value={n} key={n}>
                  {n.toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <label className="switch-row">
            <span>
              Acronym rewriting<small>Ablate query expansion</small>
            </span>
            <input
              disabled={busy}
              type="checkbox"
              checked={value.rewrite}
              onChange={(e) =>
                onChange({ ...value, rewrite: e.target.checked })
              }
            />
          </label>
          <label className="switch-row">
            <span>
              Neural reranking
              <small>
                {dense
                  ? "Optional cross-encoder"
                  : "Enable dense backend first"}
              </small>
            </span>
            <input
              disabled={busy || !dense}
              type="checkbox"
              checked={value.rerank}
              onChange={(e) => onChange({ ...value, rerank: e.target.checked })}
            />
          </label>
        </div>
      </div>
    </details>
  );
}
