import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDot,
  Cpu,
  FlaskConical,
  Layers3,
  Orbit,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import type { Translate } from "./locale";
import "./model-dock.css";

export type Provider = "ollama" | "compatible" | "transformers" | "adapter";
export type ModelRef = { provider: Provider; name: string };
export type LocalModel = ModelRef & {
  size_bytes?: number | null;
  parameters?: string | null;
  quantization?: string | null;
  family?: string | null;
  format?: string | null;
  context_tokens?: number | null;
  revision?: string | null;
  configured?: boolean;
};
export const modelKey = (model: ModelRef) => model.provider + "|" + model.name;
const providerLabel: Record<Provider, string> = {
  ollama: "Ollama",
  compatible: "OpenAI-compatible",
  transformers: "Transformers",
  adapter: "LoRA",
};

const catalog = [
  {
    provider: "ollama",
    name: "gemma3:1b",
    title: "Gemma 3",
    maker: "Google",
    parameters: "1B",
    icon: Sparkles,
    color: "blue",
    source: "https://ollama.com/library/gemma3:1b",
    license: "Gemma Terms of Use",
    purpose: [
      "Everyday chat and short summaries",
      "Chat quotidiana e brevi riassunti",
      "Chat diario y resúmenes breves",
    ],
  },
  {
    provider: "ollama",
    name: "qwen3.5:0.8b",
    title: "Qwen 3.5",
    maker: "Qwen",
    parameters: "0.8B",
    icon: Orbit,
    color: "violet",
    source: "https://ollama.com/library/qwen3.5:0.8b",
    license: "Apache 2.0",
    purpose: [
      "Small multilingual baseline for instructions and code",
      "Baseline multilingue compatta per istruzioni e codice",
      "Referencia multilingüe compacta para instrucciones y código",
    ],
  },
  {
    provider: "ollama",
    name: "llama3.2:1b",
    title: "Llama 3.2",
    maker: "Meta",
    parameters: "1B",
    icon: Layers3,
    color: "coral",
    source: "https://ollama.com/library/llama3.2:1b",
    license: "Llama 3.2 Community License",
    purpose: [
      "Multilingual dialogue and rewriting",
      "Dialogo multilingue e riscrittura",
      "Diálogo multilingüe y reescritura",
    ],
  },
  {
    provider: "ollama",
    name: "smollm2:360m",
    title: "SmolLM2",
    maker: "Hugging Face",
    parameters: "360M",
    icon: Zap,
    color: "amber",
    source: "https://ollama.com/library/smollm2:360m",
    license: "Apache 2.0",
    purpose: [
      "Quick checks and simple English tasks",
      "Prove rapide e compiti semplici in inglese",
      "Pruebas rápidas y tareas sencillas en inglés",
    ],
  },
  {
    provider: "transformers",
    name: "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
    title: "TinyLlama Chat",
    maker: "TinyLlama",
    parameters: "1.1B",
    icon: FlaskConical,
    color: "teal",
    source: "https://huggingface.co/TinyLlama/TinyLlama-1.1B-Chat-v1.0",
    license: "Apache 2.0",
    purpose: [
      "English chat baseline for direct Transformers inference",
      "Baseline di chat in inglese con inferenza Transformers diretta",
      "Referencia de chat en inglés con inferencia directa de Transformers",
    ],
  },
] as const;

function weightSize(bytes: number | null | undefined, locale: string) {
  if (typeof bytes !== "number" || bytes <= 0 || !Number.isFinite(bytes))
    return null;
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return bytes >= 1e9
    ? format.format(bytes / 1e9) + " GB"
    : format.format(bytes / 1e6) + " MB";
}

export default function ModelDock({
  models,
  selected,
  disabled,
  refreshing,
  loaded,
  t,
  locale,
  onSelect,
  onRefresh,
  onAdd,
}: {
  models: LocalModel[];
  selected?: ModelRef;
  disabled: boolean;
  refreshing: boolean;
  loaded: boolean;
  t: Translate;
  locale: string;
  onSelect: (model: ModelRef) => void;
  onRefresh: () => void;
  onAdd: (model: ModelRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "ready">("all");
  const [provider, setProvider] = useState<"transformers" | "compatible">(
    "transformers",
  );
  const [identifier, setIdentifier] = useState("");
  const browse = useRef<HTMLButtonElement>(null);
  const library = new Map(catalog.map((item) => [modelKey(item), item]));
  const available = new Map(models.map((model) => [modelKey(model), model]));
  const active = selected && available.get(modelKey(selected));
  const profile = active && library.get(modelKey(active));
  const ActiveIcon = profile?.icon ?? Cpu;
  const entries = [
    ...new Map(
      [...catalog, ...models].map((item) => [modelKey(item), item]),
    ).values(),
  ].filter((item) => {
    const key = modelKey(item);
    const title = library.get(key)?.title ?? item.name;
    return (
      (filter === "all" ||
        (available.has(key) && !available.get(key)?.configured)) &&
      [item.name, title, providerLabel[item.provider]].some((value) =>
        value.toLowerCase().includes(query.trim().toLowerCase()),
      )
    );
  });
  const installed = models.filter((model) => !model.configured);
  const runtimeCount = new Set(installed.map((model) => model.provider)).size;
  const activeText = t("Active model", "Modello attivo", "Modelo activo");

  return (
    <section
      className="model-dock"
      aria-label={t(
        "Model library",
        "Libreria modelli",
        "Biblioteca de modelos",
      )}
    >
      <div className="model-dock-main">
        <div className={"model-insignia " + (profile?.color ?? "blue")}>
          <ActiveIcon size={23} aria-hidden="true" />
        </div>
        <div className="model-dock-title">
          <div className="model-dock-kicker">
            <span
              className={
                active && !active.configured ? "model-led ready" : "model-led"
              }
            />
            {activeText}
          </div>
          <strong>
            {profile?.title ??
              active?.name ??
              t("Choose a model", "Scegli un modello", "Elige un modelo")}
          </strong>
          {active && (
            <span>
              {[
                providerLabel[active.provider],
                active.parameters || profile?.parameters,
                active.quantization,
                weightSize(active.size_bytes, locale),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </div>
        <div className="model-dock-controls">
          <span className="model-inventory-count" aria-live="polite">
            {loaded
              ? t(
                  installed.length + " ready · " + runtimeCount + " runtimes",
                  installed.length + " pronti · " + runtimeCount + " runtime",
                  installed.length + " listos · " + runtimeCount + " entornos",
                )
              : t(
                  "Detecting local models…",
                  "Ricerca modelli locali…",
                  "Buscando modelos locales…",
                )}
          </span>
          <button
            ref={browse}
            className="model-browse"
            type="button"
            aria-expanded={open}
            aria-controls="model-library-panel"
            onClick={() => setOpen((value) => !value)}
          >
            <Layers3 size={15} aria-hidden="true" />
            {t("Browse models", "Sfoglia modelli", "Explorar modelos")}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      {open && (
        <div className="model-library-panel" id="model-library-panel">
          <div className="model-library-toolbar">
            <label className="model-filter">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={t(
                  "Filter models",
                  "Filtra modelli",
                  "Filtrar modelos",
                )}
                placeholder={t(
                  "Search models or runtimes",
                  "Cerca modelli o runtime",
                  "Buscar modelos o entornos",
                )}
              />
            </label>
            <div className="model-library-filters">
              {(["all", "ready"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {key === "all"
                    ? t("All models", "Tutti i modelli", "Todos los modelos")
                    : t("Ready", "Pronti", "Listos")}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="secondary model-refresh"
              disabled={disabled}
              onClick={onRefresh}
            >
              <RefreshCw
                size={15}
                className={refreshing ? "model-spinning" : ""}
                aria-hidden="true"
              />
              {t("Refresh", "Aggiorna", "Actualizar")}
            </button>
          </div>
          <div className="model-library-grid">
            {entries.map((item) => {
              const key = modelKey(item);
              const spec = library.get(key);
              const found = available.get(key);
              const chosen = active && key === modelKey(active);
              const Icon = spec?.icon ?? Cpu;
              const title = spec?.title ?? item.name;
              const details = [
                found?.parameters || spec?.parameters,
                found?.quantization,
                found?.format,
                weightSize(found?.size_bytes, locale),
              ].filter(Boolean);
              return (
                <article
                  key={key}
                  className={"model-library-card" + (chosen ? " selected" : "")}
                >
                  <div className="model-library-card-head">
                    <div
                      className={"model-insignia " + (spec?.color ?? "blue")}
                    >
                      <Icon size={19} aria-hidden="true" />
                    </div>
                    <span
                      className={"model-card-state" + (found ? " ready" : "")}
                    >
                      {chosen ? (
                        <Check size={12} aria-hidden="true" />
                      ) : (
                        <CircleDot size={11} aria-hidden="true" />
                      )}
                      {chosen
                        ? t("Active", "Attivo", "Activo")
                        : found?.configured
                          ? t("Configured", "Configurato", "Configurado")
                          : found
                            ? t("Ready", "Pronto", "Listo")
                            : t(
                                "Not installed",
                                "Non installato",
                                "Sin instalar",
                              )}
                    </span>
                  </div>
                  <div>
                    <h3>{title}</h3>
                    <span className="model-card-provider">
                      {[spec?.maker, providerLabel[item.provider]]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <p>
                    {spec
                    ? t(spec.purpose[0], spec.purpose[1], spec.purpose[2])
                      : t(
                          "Custom local runtime model",
                          "Modello locale personalizzato",
                          "Modelo local personalizado",
                        )}
                  </p>
                  {details.length > 0 && (
                    <div className="model-specs">
                      {details.map((detail, index) => (
                        <span key={index}>{detail}</span>
                      ))}
                    </div>
                  )}
                  <details className="model-card-details">
                    <summary>
                      {t(
                        "Model details",
                        "Dettagli modello",
                        "Detalles del modelo",
                      )}
                    </summary>
                    <dl>
                      <div>
                        <dt>ID</dt>
                        <dd>{item.name}</dd>
                      </div>
                      {spec && (
                        <div>
                          <dt>{t("License", "Licenza", "Licencia")}</dt>
                          <dd>{spec.license}</dd>
                        </div>
                      )}
                      {found?.family && (
                        <div>
                          <dt>
                            {t("Architecture", "Architettura", "Arquitectura")}
                          </dt>
                          <dd>{found.family}</dd>
                        </div>
                      )}
                      {found?.context_tokens && (
                        <div>
                          <dt>
                            {t(
                              "Checkpoint context",
                              "Contesto checkpoint",
                              "Contexto del punto de control",
                            )}
                          </dt>
                          <dd>
                            {new Intl.NumberFormat(locale).format(
                              found.context_tokens,
                            )}{" "}
                            tokens
                          </dd>
                        </div>
                      )}
                      {found?.revision && (
                        <div>
                          <dt>{t("Revision", "Revisione", "Revisión")}</dt>
                          <dd>
                            <code title={found.revision}>
                              {found.revision.slice(0, 12)}
                            </code>
                          </dd>
                        </div>
                      )}
                    </dl>
                    {spec && (
                      <a href={spec.source} target="_blank" rel="noreferrer">
                        {t("Model card", "Scheda ufficiale", "Ficha oficial")}{" "}
                        <ArrowUpRight size={13} aria-hidden="true" />
                      </a>
                    )}
                  </details>
                  {found ? (
                    <button
                      className="model-use"
                      type="button"
                      aria-pressed={Boolean(chosen)}
                      aria-label={t(
                        "Use " + title,
                        "Usa " + title,
                        "Usar " + title,
                      )}
                      disabled={disabled}
                      onClick={() => {
                        onSelect({
                          provider: found.provider,
                          name: found.name,
                        });
                        setOpen(false);
                        browse.current?.focus();
                      }}
                    >
                      {chosen
                        ? t("Selected", "Selezionato", "Seleccionado")
                        : t("Use model", "Usa modello", "Usar modelo")}
                    </button>
                  ) : (
                    <code className="model-install">
                      {item.provider === "ollama"
                        ? "ollama pull "
                        : "hf download "}
                      {item.name}
                    </code>
                  )}
                </article>
              );
            })}
          </div>
          {!entries.length && (
            <p className="model-empty">
              {t(
                "No models match your filter.",
                "Nessun modello corrisponde al filtro.",
                "Ningún modelo coincide con el filtro.",
              )}
            </p>
          )}
          <details className="model-advanced">
            <summary>
              {t(
                "Add a custom model",
                "Aggiungi un modello",
                "Añadir un modelo personalizado",
              )}
            </summary>
            <p>
              {t(
                "Add a cached Hugging Face checkpoint or a model served by LM Studio, llama.cpp, or vLLM.",
                "Aggiungi un checkpoint Hugging Face già scaricato o un modello servito da LM Studio, llama.cpp o vLLM.",
                "Añade un punto de control de Hugging Face descargado o un modelo servido por LM Studio, llama.cpp o vLLM.",
              )}
            </p>
            <form
              className="hub-inline"
              onSubmit={(event) => {
                event.preventDefault();
                if (!identifier.trim()) return;
                onAdd({ provider, name: identifier.trim() });
                setIdentifier("");
                setOpen(false);
                browse.current?.focus();
              }}
            >
              <select
                aria-label={t("Runtime", "Runtime", "Entorno")}
                value={provider}
                onChange={(event) =>
                  setProvider(event.target.value as typeof provider)
                }
              >
                <option value="transformers">
                  Hugging Face / Transformers
                </option>
                <option value="compatible">LM Studio / llama.cpp / vLLM</option>
              </select>
              <input
                aria-label={t(
                  "Model ID or folder",
                  "ID modello o cartella",
                  "ID del modelo o carpeta",
                )}
                required
                maxLength={512}
                value={identifier}
                placeholder="org/model"
                onChange={(event) => setIdentifier(event.target.value)}
              />
              <button type="submit" className="secondary" disabled={disabled}>
                <Plus size={15} />
                {t("Add model", "Aggiungi modello", "Añadir modelo")}
              </button>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}
