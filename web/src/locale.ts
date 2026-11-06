export type Language = "en" | "it" | "es";
export type Translate = (
  english: string,
  italian: string,
  spanish: string,
) => string;
export const translator =
  (lang: Language): Translate =>
  (en, it, es) =>
    ({ en, it, es })[lang];
export function readLanguage(): Language {
  const saved = localStorage.getItem("evidencelab.language");
  return saved === "it" || saved === "es" ? saved : "en";
}
export const navigation: Record<string, [string, string, string]> = {
  chat: ["Local chat", "Chat locale", "Chat local"],
  crew: ["Agent workshop", "Officina agenti", "Taller de agentes"],
  experiments: [
    "Model experiments",
    "Esperimenti sui modelli",
    "Experimentos con modelos",
  ],
  actions: [
    "Actions & integrations",
    "Azioni e integrazioni",
    "Acciones e integraciones",
  ],
  workspace: ["Research desk", "Scrivania di ricerca", "Mesa de investigación"],
  papers: [
    "Paper library",
    "Biblioteca di articoli",
    "Biblioteca de artículos",
  ],
  pipeline: ["RAG pipeline", "Pipeline RAG", "Flujo RAG"],
  vectors: ["Vector explorer", "Esplora vettori", "Explorador vectorial"],
  notebooks: ["Notebook studio", "Studio notebook", "Estudio de cuadernos"],
  observatory: [
    "Experiment observatory",
    "Osservatorio esperimenti",
    "Observatorio de experimentos",
  ],
  models: ["Foundation models", "Modelli di base", "Modelos base"],
  agents: ["Research agents", "Agenti di ricerca", "Agentes de investigación"],
  training: [
    "Training curves",
    "Curve di addestramento",
    "Curvas de entrenamiento",
  ],
  evaluation: [
    "Retrieval benchmarks",
    "Benchmark di recupero",
    "Evaluación de recuperación",
  ],
  capabilities: [
    "Model benchmarks",
    "Benchmark dei modelli",
    "Evaluación de modelos",
  ],
};
