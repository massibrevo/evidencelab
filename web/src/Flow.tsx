import {
  Background,
  Controls,
  MarkerType,
  Position,
  ReactFlow,
  useNodesState,
  type ReactFlowInstance,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useRef } from "react";
import type { Trace } from "./types";
export default function Flow({
  kind = "pipeline",
  trace,
  architecture = "supervisor",
  dense = false,
}: {
  kind?: "pipeline" | "agents";
  trace?: Trace[];
  architecture?: string;
  dense?: boolean;
}) {
  const labels: Record<string, [string, string]> = {
    plan: ["Planner", "Define investigation"],
    retrieve: ["Retrieval", "Search paper corpus"],
    analyze: ["Literature analyst", "Inspect evidence inventory"],
    fact_check: ["Verifier", "Check source integrity"],
    reflect: ["Reflection", "Bounded retrieval retry"],
    route: ["Router", "Select next worker"],
    synthesize: ["Synthesis", "Compose cited answer"],
    remember: ["Memory", "Record source inventory"],
  };
  let ids =
    kind === "pipeline"
      ? ["query", "retrieve", "rerank", "generate", "cite"]
      : (trace?.map((x) => x.node) ??
        (architecture === "single"
          ? ["plan", "retrieve", "synthesize", "remember"]
          : architecture === "hierarchical"
            ? [
                "plan",
                "retrieve",
                "analyze",
                "fact_check",
                "synthesize",
                "remember",
              ]
            : architecture === "swarm"
              ? [
                  "plan",
                  "retrieve",
                  "fact_check",
                  "route",
                  "analyze",
                  "synthesize",
                  "remember",
                ]
              : ["plan", "retrieve", "fact_check", "synthesize", "remember"]));
  const pipeline: Record<string, [string, string]> = {
    query: ["Query", "Optional acronym expansion"],
    retrieve: [
      dense ? "Neural + BM25" : "BM25 + TF-IDF",
      "Reciprocal rank fusion",
    ],
    rerank: ["Context", "Optional cross-encoder"],
    generate: ["Answer engine", "Extractive / local Qwen"],
    cite: ["Evidence", "Exact source offsets"],
  };
  const initialNodes: Node[] = ids.map((id, i) => ({
    id: `${id}-${i}`,
    position:
      kind === "pipeline"
        ? { x: i * 220, y: 55 }
        : { x: (i % 2) * 290 + 45, y: Math.floor(i / 2) * 145 + 40 },
    data: {
      label: (
        <div className="flow-label">
          <span className="node-index">
            {String(i + 1).padStart(2, "0")}{" "}
            <i className={trace ? "complete" : ""} />
          </span>
          <strong>
            {(kind === "pipeline" ? pipeline : labels)[id]?.[0] ?? id}
          </strong>
          <small>
            {trace
              ? `${trace[i].elapsed_ms.toFixed(1)} ms · ${trace[i].evidence_count} sources`
              : (kind === "pipeline" ? pipeline : labels)[id]?.[1]}
          </small>
        </div>
      ),
    },
    sourcePosition: kind === "pipeline" ? Position.Right : Position.Bottom,
    targetPosition: kind === "pipeline" ? Position.Left : Position.Top,
  }));
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const graphRef = useRef<HTMLDivElement>(null);
  const instance = useRef<ReactFlowInstance | null>(null);
  const signature = JSON.stringify({ kind, trace, architecture, dense });
  useEffect(() => {
    setNodes(initialNodes);
    requestAnimationFrame(
      () => void instance.current?.fitView({ padding: 0.12 }),
    );
  }, [signature]);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(
        () => void instance.current?.fitView({ padding: 0.12 }),
      );
    });
    if (graphRef.current) observer.observe(graphRef.current);
    return () => observer.disconnect();
  }, []);
  const edges: Edge[] = nodes.slice(1).map((node, i) => ({
    id: `e${i}`,
    source: nodes[i].id,
    target: node.id,
    animated: false,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: "#687c98" },
    style: { stroke: trace ? "#4c88bc" : "#8d9bb0", strokeWidth: 1.2 },
  }));
  return (
    <div
      ref={graphRef}
      className={"flow " + (kind === "agents" ? "agent-flow" : "")}
    >
      <ReactFlow
        nodes={nodes}
        onNodesChange={onNodesChange}
        onInit={(value) => {
          instance.current = value;
        }}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        nodesDraggable
        nodesConnectable={false}
        colorMode="light"
        minZoom={0.3}
        maxZoom={1.4}
        attributionPosition="bottom-right"
      >
        <Background gap={18} color="#e3e8ee" />
        {kind === "agents" && <Controls showInteractive={false} />}
      </ReactFlow>
    </div>
  );
}
