import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  FlaskConical,
  Plug,
  Send,
  ShieldCheck,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ModelDock, { modelKey, type LocalModel, type ModelRef as Model } from "./ModelDock";
import type { Language, Translate } from "./locale";
import { translator } from "./locale";
import { api, download } from "./types";
import "./hub.css";

export type HubPage = "chat" | "crew" | "experiments" | "actions";
type Inventory = {
  models: LocalModel[];
  status: Record<string, boolean>;
  actions: Record<string, boolean>;
  jev: boolean;
  training: boolean;
};
type Turn = { role: "user" | "assistant"; content: string; modelName?: string };
type Reply = { text: string; latency_ms: number; tokens: number | null };
type Agent = {
  id: string;
  name: string;
  instructions: string;
  preset?: boolean;
};
type Step = Reply & { agent_id: string; name: string };
type JobKind = "team" | "experiment" | "training";
type Job = {
  id: string;
  status: string;
  created: string;
  progress: number;
  active?: string;
  trace?: Step[];
  config?: Record<string, unknown>;
  error?: string;
  result?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
};
type Dataset = { id: string; name: string; counts: Record<string, number> };
type Sample = Reply & { index: number; expected: string; correct: boolean };
type Proposal = {
  id: string;
  status: string;
  action: Record<string, string>;
  result?: unknown;
  error?: string;
};
type Target = "local" | "jev" | "systemone";
const prefix = "/hub";
const jobPath = (kind: JobKind | "action", id?: string) =>
  prefix + "/jobs/" + kind + (id ? "/" + id : "");
const presetColors = ["#63e4db", "#ffbd67", "#cba8fb", "#ff8b9e", "#8bd7ff"];
const actionKeys = [
  "web_search",
  "web_read",
  "search_engine",
  "open_browser",
  "read_file",
  "telegram",
  "whatsapp",
] as const;
type ActionKind = (typeof actionKeys)[number];
const actionLabel = (t: Translate, kind: string) =>
  ({
    web_search: t(
      "Search Wikipedia",
      "Cerca su Wikipedia",
      "Buscar en Wikipedia",
    ),
    web_read: t("Read an article", "Leggi un articolo", "Leer un artículo"),
    search_engine: t("Search the web", "Cerca sul web", "Buscar en la web"),
    open_browser: t(
      "Open browser tab",
      "Apri scheda del browser",
      "Abrir pestaña",
    ),
    read_file: t(
      "Read a shared file",
      "Leggi un file condiviso",
      "Leer archivo compartido",
    ),
    telegram: "Telegram",
    whatsapp: "WhatsApp",
  })[kind] ?? kind;
const formatError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const modelName = (job: Job) =>
  String(
    (job.config?.model as Model | undefined)?.name ??
      job.config?.decision_model ??
      "",
  );

function ModelText({ value }: { value: string }) {
  return (
    <Markdown
      skipHtml
      remarkPlugins={[remarkGfm]}
      disallowedElements={["img", "a"]}
      unwrapDisallowed
    >
      {value}
    </Markdown>
  );
}

function Robot({ index }: { index: number }) {
  const hue = presetColors[index % presetColors.length];
  return (
    <svg
      viewBox="0 0 100 88"
      className="hub-robot"
      style={{ color: hue }}
      aria-hidden="true"
    >
      <path
        d="M50 24V12M50 12l12-6M22 48H13v18h11m54-18h9v18H76M37 74v8m26-8v8"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="64" cy="6" r="4" fill="currentColor" />
      <rect
        x="22"
        y="25"
        width="56"
        height="50"
        rx={10 + (index % 3) * 5}
        fill="currentColor"
      />
      <rect x="30" y="36" width="40" height="25" rx="9" fill="#161c2d" />
      {index % 3 === 1 ? (
        <path
          d="M39 49h22"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      ) : (
        <>
          <circle cx="42" cy="48.5" r="3.5" fill="currentColor" />
          <circle cx="58" cy="48.5" r="3.5" fill="currentColor" />
        </>
      )}
      <path
        d="M43 67h14"
        stroke="#161c2d"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Status({ value, t }: { value: string; t: Translate }) {
  return (
    <span className={"hub-status " + value}>
      {(
        {
          running: t("Running", "In corso", "En curso"),
          completed: t("Completed", "Completato", "Completado"),
          failed: t("Failed", "Non riuscito", "Fallido"),
          pending: t(
            "Awaiting approval",
            "In attesa di approvazione",
            "Pendiente de aprobación",
          ),
          denied: t("Denied", "Negato", "Rechazado"),
          executing: t("Executing", "In esecuzione", "Ejecutando"),
        } as Record<string, string>
      )[value] ?? value}
    </span>
  );
}

export default function Hub({
  page,
  language,
  showCurves,
}: {
  page: HubPage | null;
  language: Language;
  showCurves: () => void;
}) {
  const t = translator(language);
  const [inventory, setInventory] = useState<Inventory>();
  const [model, setModel] = useState<Model>();
  const [manual, setManual] = useState<LocalModel[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [lastReply, setLastReply] = useState<Reply>();
  const [context, setContext] = useState("");
  const [roster, setRoster] = useState<Agent[]>([]);
  const [team, setTeam] = useState(["atlas", "pixel", "sentinel", "relay"]);
  const [task, setTask] = useState("");
  const [agentName, setAgentName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [teamJob, setTeamJob] = useState<Job>();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [dataset, setDataset] = useState("");
  const [upload, setUpload] = useState<File>();
  const [target, setTarget] = useState<Target>("local");
  const [decisionModel, setDecisionModel] = useState("");
  const [criteria, setCriteria] = useState("");
  const [decisionPrompt, setDecisionPrompt] = useState("");
  const [allowExternal, setAllowExternal] = useState(false);
  const [split, setSplit] = useState("validation");
  const [limit, setLimit] = useState(10);
  const [trainModel, setTrainModel] = useState("qwen-0.8b");
  const [revision, setRevision] = useState("main");
  const [steps, setSteps] = useState(10);
  const [rank, setRank] = useState(8);
  const [quantization, setQuantization] = useState("none");
  const [experimentJob, setExperimentJob] = useState<Job>();
  const [trainingJob, setTrainingJob] = useState<Job>();
  const [records, setRecords] = useState<{ kind: JobKind; job: Job }[]>([]);
  const [actionHistory, setActionHistory] = useState<Proposal[]>([]);
  const [action, setAction] = useState<Proposal>();
  const [actionKind, setActionKind] = useState<ActionKind>("web_search");
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const timeline = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [pendingQuestion, setPendingQuestion] = useState("");
  useEffect(() => {
    if (page === "chat" && timeline.current) {
      timeline.current.scrollTop = timeline.current.scrollHeight;
    }
  }, [page, turns.length, pendingQuestion]);

  function refreshModels() {
    return api<Inventory>(prefix + "/models").then((data) => {
      setInventory(data);
      setModel((existing) => {
        const preferred = existing ? modelKey(existing) : localStorage.getItem("evidencelab.activeModel");
        const selected = [...data.models, ...manual].find(row => modelKey(row) === preferred)
          ?? data.models.find(row => modelKey(row) === "ollama|gemma3:1b")
          ?? data.models[0];
        return selected && { provider: selected.provider, name: selected.name };
      });
    });
  }
  useEffect(() => {
    if (model) localStorage.setItem("evidencelab.activeModel", modelKey(model));
  }, [model]);
  function refreshAgents() {
    return api<Agent[]>(prefix + "/agents").then(setRoster);
  }
  function refreshActions() {
    return api<Proposal[]>(jobPath("action")).then(setActionHistory);
  }
  function refreshRuns() {
    return Promise.all(
      (["experiment", "training", "team"] as const).map(async (kind) =>
        (await api<Job[]>(jobPath(kind))).map((job) => ({ kind, job })),
      ),
    ).then((rows) =>
      setRecords(
        rows.flat().sort((a, b) => b.job.created.localeCompare(a.job.created)),
      ),
    );
  }
  function refreshDatasets() {
    return api<Dataset[]>(prefix + "/datasets").then((data) => {
      setDatasets(data);
      setDataset((existing) => existing || data[0]?.id || "");
    });
  }
  useEffect(() => {
    if (!page) return;
    setError("");
    if (!inventory)
      refreshModels().catch((error) => setError(formatError(error)));
    if (page === "crew")
      refreshAgents().catch((error) => setError(formatError(error)));
    if (page === "actions")
      refreshActions().catch((error) => setError(formatError(error)));
    if (page === "experiments") {
      Promise.all([refreshDatasets(), refreshRuns()]).catch((error) =>
        setError(formatError(error)),
      );
    }
    // Keep the model selection and chat while navigating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  const runningTeam = teamJob?.status === "running" ? teamJob.id : undefined;
  const runningEval =
    experimentJob?.status === "running" ? experimentJob.id : undefined;
  const runningTrain =
    trainingJob?.status === "running" ? trainingJob.id : undefined;
  useEffect(() => {
    const active = runningTeam
      ? (["team", runningTeam, setTeamJob] as const)
      : runningEval
        ? (["experiment", runningEval, setExperimentJob] as const)
        : runningTrain
          ? (["training", runningTrain, setTrainingJob] as const)
          : null;
    if (!active) return;
    let stopped = false;
    let timer: number;
    const [kind, id, update] = active;
    async function poll() {
      try {
        const job = await api<Job>(jobPath(kind, id));
        if (stopped) return;
        update(job);
        if (job.status !== "running") {
          await refreshRuns();
          if (kind === "training" && job.status === "completed")
            await refreshModels();
          return;
        }
      } catch (error) {
        if (!stopped) setError(formatError(error));
      }
      if (!stopped) timer = window.setTimeout(poll, 1200);
    }
    timer = window.setTimeout(poll, 700);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [runningTeam, runningEval, runningTrain]);

  async function operation(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await fn();
    } catch (error) {
      setError(formatError(error));
    } finally {
      setBusy("");
    }
  }
  if (!page) return null;
  const currentModels = Array.from(
    new Map(
      [...manual, ...(inventory?.models ?? [])].map(
        (model) => [modelKey(model), model],
      ),
    ).values(),
  );
  const blocked = Boolean(busy);
  const jobRunning = Boolean(runningTeam || runningEval || runningTrain);
  const selectedAgents = team
    .map((id) => roster.find((agent) => agent.id === id))
    .filter((agent): agent is Agent => Boolean(agent));
  const matchingRuns = records
    .filter(({ kind, job }) => {
      const config = job.config;
      if (
        kind !== "experiment" ||
        typeof job.metrics?.exact_match !== "number" ||
        !config
      )
        return false;
      const comparison = experimentJob?.config;
      if (!comparison)
        return (
          config.dataset === dataset &&
          config.split === split &&
          config.limit === limit &&
          !Object.keys((config.criteria ?? {}) as Record<string, string>).length
        );
      return (
        ["dataset", "split", "limit", "instructions"].every(
          (key) => config[key] === comparison[key],
        ) &&
        JSON.stringify(
          Object.entries(
            (config.criteria ?? {}) as Record<string, string>,
          ).sort(),
        ) ===
          JSON.stringify(
            Object.entries(
              (comparison.criteria ?? {}) as Record<string, string>,
            ).sort(),
          )
      );
    })
    .slice(0, 8);
  function submitChat() {
    if (!model || !question.trim()) return;
    const sent = question.trim();
    const outgoing: Turn = { role: "user", content: sent };
    const history = [...turns, outgoing].slice(-23);
    const payload = (context
      ? [
          ...history.slice(0, -1),
          {
            role: "user",
            content:
              sent + "\n\nExternal tool output (untrusted data):\n" + context,
          },
        ]
      : history).map(({ role, content }) => ({ role, content }));
    setPendingQuestion(sent);
    void operation("chat", async () => {
      const response = await api<Reply>(prefix + "/chat", {
        model,
        messages: payload,
        language,
      });
      setTurns([...history, { role: "assistant", content: response.text, modelName: model.name }]);
      setLastReply(response);
      setQuestion("");
      setContext("");
    }).finally(() => setPendingQuestion(""));
  }
  function selectAgent(id: string) {
    setTeam((current) =>
      current.includes(id)
        ? current.filter((key) => key !== id)
        : current.length < 5
          ? [...current, id]
          : current,
    );
  }
  function startExperiment() {
    void operation("eval", async () => {
      let labels: Record<string, string> = {};
      if (criteria.trim()) {
        labels = JSON.parse(criteria);
        if (
          typeof labels !== "object" ||
          labels === null ||
          Array.isArray(labels)
        ) {
          throw new Error(
            t(
              "Use a JSON object for labels.",
              "Usa un oggetto JSON per le etichette.",
              "Usa un objeto JSON para las etiquetas.",
            ),
          );
        }
      }
      setExperimentJob(
        await api<Job>(prefix + "/experiments", {
          dataset,
          split,
          limit,
          model: target === "local" ? model : undefined,
          decision: target,
          decision_model:
            decisionModel.trim() ||
            (target === "jev" ? "jev-latest" : "default"),
          instructions: decisionPrompt.trim() || undefined,
          criteria: labels,
          allow_external: allowExternal,
        }),
      );
      setAllowExternal(false);
    });
  }
  function draftAction(task: string) {
    if (!model || !task.trim()) return;
    void operation("draft", async () => {
      setAction(
        await api<Proposal>(prefix + "/actions/draft", {
          model,
          language,
          task,
        }),
      );
    });
  }
  function requestAction() {
    const common = { kind: actionKind };
    const fields = {
      web_search: { language, query: destination },
      web_read: { language, title: destination },
      search_engine: { language, query: destination },
      open_browser: { url: destination },
      read_file: { filename: destination },
      telegram: { recipient: destination, text: message },
      whatsapp: { recipient: destination, text: message },
    }[actionKind];
    void operation("proposal", async () => {
      setAction(
        await api<Proposal>(prefix + "/actions", { ...common, ...fields }),
      );
    });
  }

  const approval = action && (
    <section
      className="panel hub-approval"
      aria-label={t("Action review", "Revisione azione", "Revisión de acción")}
    >
      <div className="hub-card-head">
        <ShieldCheck size={20} />
        <h2>{actionLabel(t, action.action.kind)}</h2>
        <Status value={action.status} t={t} />
      </div>
      <dl>
        {Object.entries(action.action)
          .filter(([key]) => key !== "kind")
          .map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {action.error && (
        <p className="error" role="alert">
          {action.error}
        </p>
      )}
      {action.result !== undefined && (
        <pre className="hub-result">
          {JSON.stringify(action.result, null, 2)}
        </pre>
      )}
      {action.status === "pending" && (
        <div className="hub-buttons">
          {[true, false].map((approve) => (
            <button
              key={String(approve)}
              disabled={blocked}
              className={approve ? "primary" : "secondary"}
              onClick={() =>
                operation("review", async () => {
                  setAction(
                    await api<Proposal>(
                      prefix + "/actions/" + action.id + "/review",
                      { approve },
                    ),
                  );
                  await refreshActions();
                })
              }
            >
              {approve
                ? t("Approve once", "Approva una volta", "Aprobar una vez")
                : t("Deny", "Rifiuta", "Rechazar")}
            </button>
          ))}
        </div>
      )}
      {page === "chat" && action.result !== undefined && (
        <button
          className="secondary"
          onClick={() =>
            setContext(JSON.stringify(action.result).slice(0, 7000))
          }
        >
          {t(
            "Attach output to next message",
            "Allega il risultato al prossimo messaggio",
            "Adjuntar resultado al siguiente mensaje",
          )}
        </button>
      )}
    </section>
  );

  const jobResult = (job: Job | undefined, kind: JobKind) =>
    job && (
      <div className="hub-job">
        <div className="hub-card-head">
          <Status value={job.status} t={t} />
          <code>{job.id.slice(0, 10)}</code>
          <span>
            {job.progress}{" "}
            {t("completed steps", "passaggi completati", "pasos completados")}
          </span>
        </div>
        {job.error && (
          <p className="error" role="alert">
            {job.error}
          </p>
        )}
        {kind === "experiment" &&
          typeof job.result?.exact_match === "number" && (
            <div className="hub-metrics">
              <div>
                <strong>{(job.result.exact_match * 100).toFixed(1)}%</strong>
                <span>
                  {t(
                    "Exact match",
                    "Corrispondenza esatta",
                    "Coincidencia exacta",
                  )}
                </span>
              </div>
              <div>
                <strong>
                  {Math.round(Number(job.result.mean_latency_ms))} ms
                </strong>
                <span>
                  {t("Mean latency", "Latenza media", "Latencia media")}
                </span>
              </div>
              {typeof job.result.mean_brier === "number" && (
                <div>
                  <strong>{job.result.mean_brier.toFixed(3)}</strong>
                  <span>
                    {t(
                      "Mean Brier score",
                      "Punteggio Brier medio",
                      "Puntuación de Brier media",
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
        {job.status === "completed" && (
          <div className="hub-buttons">
            <button
              className="secondary"
              onClick={() => download(job, kind + "-" + job.id + ".json")}
            >
              {t("Export run", "Esporta esecuzione", "Exportar ejecución")}
            </button>
            {kind === "training" && (
              <button className="secondary" onClick={showCurves}>
                {t("View training curves", "Mostra curve", "Ver curvas")}
              </button>
            )}
          </div>
        )}
        {kind === "experiment" && Array.isArray(job.result?.samples) && (
          <details>
            <summary>
              {t(
                "Inspect sample outputs",
                "Esamina le risposte",
                "Inspeccionar respuestas",
              )}
            </summary>
            <ol className="hub-samples">
              {(job.result.samples as Sample[]).map((sample) => (
                <li key={sample.index}>
                  <strong>
                    {sample.correct ? "✓" : "×"} ·{" "}
                    {sample.latency_ms.toFixed(0)} ms
                  </strong>
                  <p>
                    {t("Expected", "Atteso", "Esperado")}:{" "}
                    <code>{sample.expected}</code>
                  </p>
                  <p className="hub-prewrap">{sample.text}</p>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    );

  return (
    <div className="hub">
      <ModelDock
        models={currentModels}
        selected={model}
        disabled={blocked}
        refreshing={busy === "models"}
        loaded={Boolean(inventory)}
        t={t}
        locale={language}
        onSelect={setModel}
        onRefresh={() => operation("models", refreshModels)}
        onAdd={(row) => {
          setManual((current) => [
            ...current.filter((value) => modelKey(value) !== modelKey(row)),
            { ...row, configured: true },
          ]);
          setModel(row);
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {page === "chat" && (
        <>
          <section className="panel hub-chat">
            <div className="hub-card-head">
              <Bot size={21} />
              <h2>{t("Conversation", "Conversazione", "Conversación")}</h2>
              <button
                className="secondary"
                disabled={blocked}
                onClick={() => {
                  setTurns([]);
                  setQuestion("");
                  setLastReply(undefined);
                  setContext("");
                  setAction(undefined);
                }}
              >
                {t("New chat", "Nuova chat", "Nuevo chat")}
              </button>
            </div>
            <div className="hub-turns" aria-live="polite" ref={timeline}>
              {!turns.length && !pendingQuestion && (
                <div className="hub-chat-intro">
                  <Robot index={0} />
                  <h3>
                    {t(
                      "What are you working on?",
                      "A cosa stai lavorando?",
                      "¿En qué estás trabajando?",
                    )}
                  </h3>
                  <p>
                    {t(
                      "Ask a question, debug code, or try an idea with your local model.",
                      "Fai una domanda, correggi del codice o prova un’idea con il modello locale.",
                      "Haz una pregunta, depura código o prueba una idea con tu modelo local.",
                    )}
                  </p>
                  <div className="hub-starters">
                    {[
                      ["2 + 2", "2 + 2 = ?"],
                      [t("Learn something", "Impara qualcosa", "Aprende algo"), t("Explain how a language model predicts the next token, using a short example.", "Spiega come un modello linguistico predice il prossimo token, con un breve esempio.", "Explica cómo un modelo de lenguaje predice el siguiente token con un ejemplo breve.")],
                      [t("Write some code", "Scrivi codice", "Escribe código"), t("Write a small Python function that groups words by their first letter.", "Scrivi una funzione Python che raggruppi le parole per iniziale.", "Escribe una función de Python que agrupe palabras por su primera letra.")],
                    ].map(([label, prompt]) => <button key={label} type="button" className="secondary" onClick={() => {
                      setQuestion(prompt);
                      composer.current?.focus();
                    }}>{label}</button>)}
                  </div>
                </div>
              )}
              {turns.map((turn, index) => (
                <article key={index} className={"hub-turn " + turn.role}>
                  <strong>
                    {turn.role === "user"
                      ? t("You", "Tu", "Tú")
                      : turn.modelName ?? t("Model", "Modello", "Modelo")}
                  </strong>
                  {turn.role === "assistant" ? (
                    <ModelText value={turn.content} />
                  ) : (
                    <p>{turn.content}</p>
                  )}
                </article>
              ))}
              {lastReply && (
                <small>
                  {lastReply.latency_ms} ms{" "}
                  {lastReply.tokens == null
                    ? ""
                    : " · " + lastReply.tokens + " tokens"}
                </small>
              )}
              {pendingQuestion && (
                <>
                  <article className="hub-turn user">
                    <strong>{t("You", "Tu", "Tú")}</strong><p>{pendingQuestion}</p>
                  </article>
                  <div className="hub-generating" role="status"><span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" />
                    {t("Generating…", "Generazione…", "Generando…")}
                  </div>
                </>
              )}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitChat();
              }}
            >
              {context && (
                <p>
                  {t(
                    "Approved action output attached.",
                    "Risultato approvato allegato.",
                    "Resultado aprobado adjunto.",
                  )}
                </p>
              )}
              <textarea
                ref={composer}
                rows={3}
                maxLength={8000}
                aria-label={t("Chat message", "Messaggio", "Mensaje")}
                value={question}
                readOnly={busy === "chat"}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !blocked) {
                    event.preventDefault();
                    submitChat();
                  }
                }}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={t(
                  "Message your local model…",
                  "Scrivi al modello locale…",
                  "Escribe a tu modelo local…",
                )}
              />
              <div className="hub-buttons">
                <button
                  type="submit"
                  className="primary"
                  disabled={blocked || !model || !question.trim()}
                >
                  <Send size={15} />
                  {t("Send", "Invia", "Enviar")}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={blocked || !model || !question.trim()}
                  onClick={() => draftAction(question)}
                >
                  {t(
                    "Propose a tool action",
                    "Proponi un’azione",
                    "Proponer una acción",
                  )}
                </button>
              </div>
            </form>
          </section>
          {approval}
        </>
      )}

      {page === "crew" && (
        <>
          <section className="hub-deck">
            <div className="hub-card-head">
              <Bot size={20} />
              <h2>
                {t(
                  "Handoff board",
                  "Sequenza degli agenti",
                  "Tablero de relevos",
                )}
              </h2>
              {teamJob && <Status value={teamJob.status} t={t} />}
              <span>{selectedAgents.length} / 5</span>
            </div>
            <div className="hub-crew">
              {selectedAgents.map((agent, index) => {
                const output = teamJob?.trace?.find(
                  (step) => step.agent_id === agent.id,
                );
                return (
                  <div className="hub-crew-slot" key={agent.id}>
                    {index > 0 && <ArrowRight className="hub-link" size={18} />}
                    <button
                      disabled={jobRunning || blocked}
                      className={
                        "hub-agent " +
                        (teamJob?.active === agent.id ? "active" : "")
                      }
                      title={agent.instructions}
                      onClick={() => selectAgent(agent.id)}
                    >
                      <span className="hub-agent-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <Robot index={index} />
                      <strong>{agent.name}</strong>
                      <small>
                        {output
                          ? t("Complete", "Completato", "Completado")
                          : teamJob?.active === agent.id
                            ? t("Working", "Al lavoro", "Trabajando")
                            : t("Ready", "Pronto", "Listo")}
                      </small>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
          <div className="hub-columns">
            <section className="panel hub-card">
              <h2>
                {t(
                  "Assemble your team",
                  "Componi la squadra",
                  "Arma tu equipo",
                )}
              </h2>
              <p>
                {t(
                  "Select agents in handoff order. Each agent receives the task and the preceding outputs.",
                  "Seleziona gli agenti in ordine. Ognuno riceve il compito e i risultati precedenti.",
                  "Selecciona los agentes en orden. Cada uno recibe la tarea y las respuestas anteriores.",
                )}
              </p>
              <div className="hub-buttons">
                {roster.map((agent) => (
                  <button
                    key={agent.id}
                    className={
                      team.includes(agent.id) ? "primary" : "secondary"
                    }
                    aria-pressed={team.includes(agent.id)}
                    disabled={jobRunning || blocked}
                    onClick={() => selectAgent(agent.id)}
                  >
                    {agent.name}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!model) return;
                  void operation("team", async () => {
                    setTeamJob(
                      await api<Job>(prefix + "/teams", {
                        model,
                        task,
                        language,
                        agent_ids: team,
                      }),
                    );
                  });
                }}
              >
                <label>
                  {t("Team task", "Compito della squadra", "Tarea del equipo")}
                  <textarea
                    rows={4}
                    required
                    maxLength={8000}
                    value={task}
                    onChange={(event) => setTask(event.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  disabled={
                    blocked ||
                    jobRunning ||
                    !model ||
                    !selectedAgents.length ||
                    !task.trim()
                  }
                >
                  {t("Run team", "Avvia squadra", "Ejecutar equipo")}
                </button>
              </form>
            </section>
            <form
              className="panel hub-card"
              onSubmit={(event) => {
                event.preventDefault();
                void operation("agent", async () => {
                  const agent = await api<Agent>(prefix + "/agents", {
                    name: agentName,
                    instructions,
                  });
                  setRoster((rows) => [...rows, agent]);
                  setAgentName("");
                  setInstructions("");
                });
              }}
            >
              <h2>
                {t("Create an agent", "Crea un agente", "Crear un agente")}
              </h2>
              <label>
                {t("Name", "Nome", "Nombre")}
                <input
                  required
                  maxLength={60}
                  value={agentName}
                  onChange={(event) => setAgentName(event.target.value)}
                />
              </label>
              <label>
                {t(
                  "Role instructions",
                  "Istruzioni del ruolo",
                  "Instrucciones del rol",
                )}
                <textarea
                  required
                  rows={4}
                  maxLength={3000}
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                />
              </label>
              <button className="secondary" disabled={blocked}>
                {t("Save agent", "Salva agente", "Guardar agente")}
              </button>
            </form>
          </div>
          {teamJob && (
            <section className="panel hub-card">
              <h2>
                {t(
                  "Execution trace",
                  "Traccia di esecuzione",
                  "Traza de ejecución",
                )}
              </h2>
              {jobResult(teamJob, "team")}
              {teamJob.trace?.map((step) => (
                <details
                  key={step.agent_id}
                  open={step === teamJob.trace?.at(-1)}
                >
                  <summary>
                    {step.name} · {step.latency_ms} ms
                  </summary>
                  <ModelText value={step.text} />
                </details>
              ))}
            </section>
          )}
        </>
      )}

      {page === "experiments" && (
        <>
          <section className="panel hub-card">
            <div className="hub-card-head">
              <FlaskConical size={20} />
              <h2>
                {t(
                  "Dataset library",
                  "Libreria dei dataset",
                  "Biblioteca de conjuntos de datos",
                )}
              </h2>
            </div>
            <p>
              {t(
                "Upload JSONL with prompt, completion and split. Add group to keep related examples together.",
                "Carica JSONL con prompt, completion e split. Usa group per mantenere insieme esempi correlati.",
                "Sube JSONL con prompt, completion y split. Usa group para mantener juntos los ejemplos relacionados.",
              )}
            </p>
            <code>
              {'{"split":"validation","prompt":"2+2","completion":"4"}'}
            </code>
            <form
              className="hub-inline"
              onSubmit={(event) => {
                event.preventDefault();
                if (!upload) return;
                void operation("upload", async () => {
                  const form = new FormData();
                  form.append("file", upload);
                  const response = await fetch("/api/hub/datasets", {
                    method: "POST",
                    body: form,
                  });
                  const data = await response.json();
                  if (!response.ok)
                    throw new Error(data.detail || response.statusText);
                  await refreshDatasets();
                  setDataset(data.id);
                });
              }}
            >
              <input
                aria-label="JSONL"
                type="file"
                accept=".jsonl"
                onChange={(event) => setUpload(event.target.files?.[0])}
              />
              <button className="secondary" disabled={blocked || !upload}>
                {t(
                  "Upload dataset",
                  "Carica dataset",
                  "Subir conjunto de datos",
                )}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={blocked}
                onClick={() =>
                  operation("demo", async () => {
                    const result = await api<Dataset>(
                      prefix + "/datasets/demo",
                      {},
                    );
                    await refreshDatasets();
                    setDataset(result.id);
                  })
                }
              >
                {t(
                  "Add demo dataset",
                  "Aggiungi dataset demo",
                  "Añadir conjunto de demostración",
                )}
              </button>
            </form>
            <label>
              {t(
                "Dataset version",
                "Versione del dataset",
                "Versión del conjunto",
              )}
              <select
                value={dataset}
                onChange={(event) => setDataset(event.target.value)}
              >
                <option value="">—</option>
                {datasets.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name} · {row.id.slice(0, 8)} · {row.counts.train}/
                    {row.counts.validation}/{row.counts.test}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <div className="hub-columns">
            <form
              className="panel hub-card"
              onSubmit={(event) => {
                event.preventDefault();
                startExperiment();
              }}
            >
              <h2>
                {t("Evaluate a model", "Valuta un modello", "Evalúa un modelo")}
              </h2>
              <label>
                {t("Backend", "Motore", "Motor")}
                <select
                  value={target}
                  onChange={(event) => {
                    setTarget(event.target.value as Target);
                    setDecisionModel("");
                    setAllowExternal(false);
                  }}
                >
                  <option value="local">
                    {t(
                      "Selected local chat model",
                      "Modello di chat locale",
                      "Modelo de chat local",
                    )}
                  </option>
                  <option value="jev">
                    TypeSafe Jev · {t("hosted", "ospitato", "alojado")}
                  </option>
                  <option value="systemone">
                    System One ·{" "}
                    {t("local endpoint", "endpoint locale", "endpoint local")}
                  </option>
                </select>
              </label>
              {target !== "local" && (
                <label>
                  {t(
                    "Model version",
                    "Versione del modello",
                    "Versión del modelo",
                  )}
                  <input
                    placeholder={target === "jev" ? "jev-latest" : "default"}
                    value={decisionModel}
                    onChange={(event) => setDecisionModel(event.target.value)}
                  />
                </label>
              )}
              <label>
                {t(
                  "Choice labels (JSON)",
                  "Etichette di scelta (JSON)",
                  "Etiquetas de elección (JSON)",
                )}
                <textarea
                  rows={2}
                  value={criteria}
                  onChange={(event) => setCriteria(event.target.value)}
                  placeholder={'{"yes":"Affirmative","no":"Negative"}'}
                  required={target !== "local"}
                />
              </label>
              <label>
                {t(
                  "Decision instructions",
                  "Istruzioni decisionali",
                  "Instrucciones de decisión",
                )}
                <input
                  value={decisionPrompt}
                  onChange={(event) => setDecisionPrompt(event.target.value)}
                  placeholder="Choose the best label for the input."
                />
              </label>
              <div className="hub-inline">
                <label>
                  {t("Split", "Partizione", "Partición")}
                  <select
                    value={split}
                    onChange={(event) => setSplit(event.target.value)}
                  >
                    <option value="validation">
                      {t("Validation", "Validazione", "Validación")}
                    </option>
                    <option value="test">Test</option>
                  </select>
                </label>
                <label>
                  {t("Examples", "Esempi", "Ejemplos")}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={limit}
                    onChange={(event) => setLimit(+event.target.value)}
                    required
                  />
                </label>
              </div>
              {target === "jev" && (
                <label className="hub-check">
                  <input
                    type="checkbox"
                    checked={allowExternal}
                    onChange={(event) => setAllowExternal(event.target.checked)}
                  />
                  {t(
                    "Send prompts and choice definitions to TypeSafe. This may incur API charges.",
                    "Invia prompt ed etichette a TypeSafe. Potrebbero esserci costi API.",
                    "Enviar indicaciones y etiquetas a TypeSafe. Puede generar costes de API.",
                  )}
                </label>
              )}
              {target === "jev" && !inventory?.jev && (
                <code>EVIDENCELAB_TYPESAFE_API_KEY</code>
              )}
              <button
                className="primary"
                disabled={
                  blocked ||
                  jobRunning ||
                  !dataset ||
                  (target === "local" && !model) ||
                  (target === "jev" && (!inventory?.jev || !allowExternal))
                }
              >
                {t(
                  "Run evaluation",
                  "Avvia valutazione",
                  "Ejecutar evaluación",
                )}
              </button>
              {jobResult(experimentJob, "experiment")}
            </form>
            <form
              className="panel hub-card"
              onSubmit={(event) => {
                event.preventDefault();
                void operation("train", async () => {
                  setTrainingJob(
                    await api<Job>(prefix + "/training", {
                      dataset,
                      model: trainModel,
                      revision,
                      max_steps: steps,
                      rank,
                      quantization,
                    }),
                  );
                });
              }}
            >
              <h2>
                {t(
                  "Fine-tune an adapter",
                  "Addestra un adattatore",
                  "Entrena un adaptador",
                )}
              </h2>
              <p>
                {t(
                  "LoRA on cached Qwen weights. Use separate train and validation splits. Completed adapters appear in the model selector.",
                  "LoRA su pesi Qwen scaricati. Usa partizioni separate di addestramento e validazione. Gli adattatori completati appaiono nel selettore.",
                  "LoRA sobre pesos Qwen descargados. Usa particiones separadas de entrenamiento y validación. Los adaptadores completados aparecen en el selector.",
                )}
              </p>
              <label>
                {t(
                  "Base checkpoint",
                  "Checkpoint di base",
                  "Punto de control base",
                )}
                <select
                  value={trainModel}
                  onChange={(event) => setTrainModel(event.target.value)}
                >
                  <option value="qwen-0.8b">Qwen3.5 0.8B</option>
                  <option value="qwen-4b">Qwen3.5 4B</option>
                </select>
              </label>
              <label>
                {t(
                  "Cached revision",
                  "Revisione scaricata",
                  "Revisión descargada",
                )}
                <input
                  value={revision}
                  maxLength={100}
                  required
                  onChange={(event) => setRevision(event.target.value)}
                />
              </label>
              <div className="hub-inline">
                <label>
                  {t("Steps", "Passaggi", "Pasos")}
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    required
                    value={steps}
                    onChange={(event) => setSteps(+event.target.value)}
                  />
                </label>
                <label>
                  {t("LoRA rank", "Rango LoRA", "Rango LoRA")}
                  <input
                    type="number"
                    min={1}
                    max={64}
                    required
                    value={rank}
                    onChange={(event) => setRank(+event.target.value)}
                  />
                </label>
              </div>
              <label>
                {t("Quantization", "Quantizzazione", "Cuantización")}
                <select
                  value={quantization}
                  onChange={(event) => setQuantization(event.target.value)}
                >
                  <option value="none">LoRA</option>
                  <option value="nf4">NF4 QLoRA · CUDA</option>
                </select>
              </label>
              <button
                className="primary"
                disabled={
                  blocked || jobRunning || !dataset || !inventory?.training
                }
              >
                {t(
                  "Start local training",
                  "Avvia addestramento locale",
                  "Iniciar entrenamiento local",
                )}
              </button>
              {jobResult(trainingJob, "training")}
            </form>
          </div>
          {matchingRuns.length > 0 && (
            <section className="panel hub-card">
              <h2>
                {t(
                  "Matched evaluations",
                  "Valutazioni confrontabili",
                  "Evaluaciones comparables",
                )}
              </h2>
              <div className="hub-bars">
                {matchingRuns.map(({ job }) => (
                  <div key={job.id}>
                    <span>
                      {modelName(job)} <code>{job.id.slice(0, 6)}</code>
                    </span>
                    <meter
                      aria-label={modelName(job)}
                      min={0}
                      max={1}
                      value={Number(job.metrics?.exact_match)}
                    />
                    <strong>
                      {(Number(job.metrics?.exact_match) * 100).toFixed(1)}%
                    </strong>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="panel hub-card">
            <h2>
              {t(
                "Run history",
                "Cronologia esecuzioni",
                "Historial de ejecuciones",
              )}
            </h2>
            <div className="hub-history">
              {records.map(({ kind, job }) => (
                <button
                  key={job.id}
                  className="secondary"
                  disabled={blocked || jobRunning}
                  onClick={() =>
                    operation("history", async () => {
                      const detail = await api<Job>(jobPath(kind, job.id));
                      if (kind === "team") {
                        setTeamJob(detail);
                        return;
                      }
                      if (kind === "training") setTrainingJob(detail);
                      else setExperimentJob(detail);
                    })
                  }
                >
                  <Status value={job.status} t={t} />
                  <code>{job.id.slice(0, 8)}</code>
                  <span>
                    {kind === "experiment"
                      ? modelName(job)
                      : kind === "training"
                        ? String(job.config?.model ?? "")
                        : t("Agent team", "Squadra", "Equipo")}
                  </span>
                  {typeof job.metrics?.exact_match === "number" && (
                    <strong>
                      {(job.metrics.exact_match * 100).toFixed(1)}% ·{" "}
                      {Math.round(Number(job.metrics.mean_latency_ms))} ms
                    </strong>
                  )}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {page === "actions" && (
        <>
          <div className="hub-columns">
            <form
              className="panel hub-card"
              onSubmit={(event) => {
                event.preventDefault();
                requestAction();
              }}
            >
              <div className="hub-card-head">
                <Plug size={20} />
                <h2>
                  {t(
                    "Request an action",
                    "Richiedi un’azione",
                    "Solicita una acción",
                  )}
                </h2>
              </div>
              <p>
                {t(
                  "Review the exact destination and payload before execution.",
                  "Controlla la destinazione e il contenuto prima dell’esecuzione.",
                  "Revisa el destino y el contenido exactos antes de ejecutar.",
                )}
              </p>
              <label>
                {t("Integration", "Integrazione", "Integración")}
                <select
                  value={actionKind}
                  onChange={(event) => {
                    setActionKind(event.target.value as ActionKind);
                    setDestination("");
                    setMessage("");
                  }}
                >
                  {actionKeys.map((kind) => (
                    <option key={kind} value={kind}>
                      {actionLabel(t, kind)}{" "}
                      {inventory?.actions?.[kind]
                        ? ""
                        : " · " + t("disabled", "disattivata", "desactivada")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t(
                  "Query, title, URL, file or recipient",
                  "Ricerca, titolo, URL, file o destinatario",
                  "Consulta, título, URL, archivo o destinatario",
                )}
                <input
                  required
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                />
              </label>
              {(actionKind === "telegram" || actionKind === "whatsapp") && (
                <label>
                  {t("Message", "Messaggio", "Mensaje")}
                  <textarea
                    required
                    maxLength={4000}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </label>
              )}
              <button
                className="primary"
                disabled={blocked || !inventory?.actions?.[actionKind]}
              >
                {t("Review request", "Rivedi richiesta", "Revisar solicitud")}
              </button>
            </form>
            <section className="panel hub-card">
              <h2>
                {t(
                  "Integration status",
                  "Stato delle integrazioni",
                  "Estado de integraciones",
                )}
              </h2>
              <ul className="hub-capabilities">
                {actionKeys.map((kind) => (
                  <li key={kind}>
                    {actionLabel(t, kind)}{" "}
                    <strong>
                      {inventory?.actions?.[kind]
                        ? t("Available", "Disponibile", "Disponible")
                        : t(
                            "Setup required",
                            "Configurazione necessaria",
                            "Requiere configuración",
                          )}
                    </strong>
                  </li>
                ))}
              </ul>
              <p>
                {t(
                  "Setup instructions are in docs/hub.md.",
                  "Le istruzioni sono in docs/hub.md.",
                  "Las instrucciones están en docs/hub.md.",
                )}
              </p>
            </section>
          </div>
          {approval}
          <section className="panel hub-card">
            <h2>
              {t(
                "Approval history",
                "Cronologia approvazioni",
                "Historial de aprobaciones",
              )}
            </h2>
            <div className="hub-history">
              {actionHistory.map((row) => (
                <button
                  key={row.id}
                  className="secondary"
                  disabled={blocked}
                  onClick={() =>
                    operation("history", async () =>
                      setAction(
                        await api<Proposal>(prefix + "/jobs/action/" + row.id),
                      ),
                    )
                  }
                >
                  <Status value={row.status} t={t} />{" "}
                  {actionLabel(t, row.action.kind)}{" "}
                  <code>{row.id.slice(0, 8)}</code>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
