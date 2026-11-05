import { Network } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  MarkerType,
  useNodesState,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import { api } from "./types";
import type { Paper } from "./types";
import { Tag } from "./UI";
import { chartColors } from "./BenchmarkCharts";
type Graph = {
  kind: string;
  concepts: string[];
  edges: { source: string; target: string; weight: number }[];
};
export default function ConceptGraph({
  onPaper,
}: {
  onPaper: (id: string) => void;
}) {
  const [graph, setGraph] = useState<Graph | null>(null),
    [papers, setPapers] = useState<Paper[]>([]),
    [concept, setConcept] = useState("all"),
    [limit, setLimit] = useState(20),
    [minimum, setMinimum] = useState(2),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<Graph>("/graph"), api<Paper[]>("/papers")])
      .then(([g, p]) => {
        setGraph(g);
        setPapers(p);
      })
      .catch((e) => setError(e.message));
  }, []);
  const derived = useMemo(() => {
    if (!graph) return { nodes: [] as Node[], edges: [] as Edge[] };
    const joined = new Map<
      string,
      { source: string; target: string; weight: number }
    >();
    for (const edge of graph.edges) {
      if (concept !== "all" && edge.target !== concept) continue;
      const key = edge.source + ":" + edge.target;
      const existing = joined.get(key);
      joined.set(key, {
        ...edge,
        weight: Math.max(edge.weight, existing?.weight ?? 0),
      });
    }
    const strengths = new Map<string, number>();
    for (const edge of joined.values())
      if (edge.weight >= minimum)
        strengths.set(
          edge.source,
          (strengths.get(edge.source) ?? 0) + edge.weight,
        );
    const ids = Array.from(strengths)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
    const concepts = concept === "all" ? graph.concepts : [concept];
    const lookup = new Map(papers.map((p) => [p.id, p]));
    const nodes: Node[] = concepts.map((name, i) => ({
      id: "concept:" + name,
      position: { x: 400, y: 70 + i * 125 },
      data: {
        label: (
          <div className="concept-node">
            <span>CONCEPT</span>
            <strong>{name}</strong>
          </div>
        ),
      },
      style: {
        background: chartColors[i % chartColors.length] + "22",
        borderColor: chartColors[i % chartColors.length],
        width: 150,
        borderRadius: 8,
      },
    }));
    ids.forEach((id, i) => {
      const angle = (i / Math.max(ids.length, 1)) * Math.PI * 2;
      nodes.push({
        id: "paper:" + id,
        position: {
          x: 400 + 420 * Math.cos(angle),
          y: 300 + 330 * Math.sin(angle),
        },
        data: {
          label: (
            <div className="paper-graph-node">
              <span>#{id}</span>
              <strong>{lookup.get(id)?.title ?? id}</strong>
            </div>
          ),
        },
        style: {
          background: "#1c2a45",
          borderColor: "#506b94",
          width: 175,
          borderRadius: 6,
        },
      });
    });
    const edges: Edge[] = Array.from(joined.values())
      .filter((e) => ids.includes(e.source) && e.weight >= minimum)
      .map((e) => ({
        id: e.source + ":" + e.target,
        source: "paper:" + e.source,
        target: "concept:" + e.target,
        label: String(e.weight),
        style: {
          stroke: chartColors[concepts.indexOf(e.target) % chartColors.length],
          strokeWidth: 1,
        },
        labelStyle: { fill: "#bcc8e2", fontSize: 8 },
        labelBgStyle: { fill: "#18243a" },
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
      }));
    return { nodes, edges };
  }, [graph, papers, concept, limit, minimum]);
  const [nodes, setNodes, onNodesChange] = useNodesState(derived.nodes);
  useEffect(() => setNodes(derived.nodes), [derived, setNodes]);
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>
          <Network size={16} />
          Concept evidence map
        </h2>
        <Tag tone="amber">HEURISTIC CO-OCCURRENCE</Tag>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="model-graph-controls">
        <label>
          Concept
          <select
            aria-label="Graph concept"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
          >
            <option value="all">All concepts</option>
            {graph?.concepts.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Paper limit
          <select
            aria-label="Graph paper limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[10, 20, 40].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Term overlap
          <select
            aria-label="Minimum concept overlap"
            value={minimum}
            onChange={(e) => setMinimum(Number(e.target.value))}
          >
            {[2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="concept-graph">
        <ReactFlow
          key={`${concept}-${limit}-${minimum}`}
          nodes={nodes}
          edges={derived.edges}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => {
            if (node.id.startsWith("paper:")) onPaper(node.id.slice(6));
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          colorMode="dark"
          nodesConnectable={false}
          minZoom={0.2}
          maxZoom={1.7}
        >
          <Background color="#354462" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="chart-provenance">
        <span className="live-dot" />
        {derived.nodes.filter((n) => n.id.startsWith("paper:")).length} papers ·{" "}
        {derived.edges.length} links · click a paper to inspect its source.
        <span>
          Edge weight is the maximum distinct concept-term overlap in one chunk.
          Not a learned knowledge graph.
        </span>
      </div>
    </section>
  );
}
