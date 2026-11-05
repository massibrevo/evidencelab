"""Bounded LangGraph workflows. Routing is explicit and deterministic in demo mode."""

import time
import uuid
from datetime import UTC, datetime
from typing import Literal, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from .models import ExtractiveGenerator


class ResearchState(TypedDict, total=False):
    question: str
    mode: str
    k: int
    rewrite: bool
    rerank: bool
    plan: list[str]
    evidence: list[dict]
    analysis: dict
    checks: dict
    answer: dict
    trace: list[dict]
    attempts: int
    next: str
    memory: list[dict]


class ResearchAgents:
    def __init__(self, index, generator=None):
        self.index, self.generator = index, generator or ExtractiveGenerator()
        self.checkpointer = InMemorySaver()
        self.graphs = {}

    def _node(self, name, fn):
        def run(state):
            start = time.perf_counter()
            update = fn(state)
            evidence = update.get("evidence", state.get("evidence", []))
            event = {
                "node": name,
                "elapsed_ms": (time.perf_counter() - start) * 1000,
                "evidence_count": len(evidence),
                "tool": {
                    "retrieve": "search_papers",
                    "reflect": "search_papers",
                    "fact_check": "verify_offsets",
                }.get(name, "structured_state"),
                "detail": update.get(
                    "plan", update.get("checks", update.get("analysis", update.get("next", "completed")))
                ),
            }
            update["trace"] = state.get("trace", []) + [event]
            return update

        return run

    def _compile(self, architecture: str):
        graph = StateGraph(ResearchState)

        def retrieve(s):
            return {
                "evidence": self.index.search(
                    s["question"], s["mode"], s["k"], rewrite=s["rewrite"], rerank=s["rerank"]
                ),
                "attempts": 1,
            }

        def reflect(s):
            # A bounded second pass drops acronym expansion, which can alter ranking.
            extra = self.index.search(s["question"], "bm25", s["k"], rewrite=False)
            combined = {e["paper_id"]: e for e in s["evidence"]}
            for e in extra:
                combined.setdefault(e["paper_id"], e)
            return {"evidence": list(combined.values())[: s["k"]], "attempts": 2}

        def fact_check(s):
            lookup = {c.id: c for c in self.index.chunks}
            valid = all(e["id"] in lookup and lookup[e["id"]].text == e["text"] for e in s["evidence"])
            return {
                "checks": {
                    "source_integrity": valid,
                    "entailment": "not evaluated",
                    "reflection_needed": len(s["evidence"]) < min(2, s["k"]) and s.get("attempts", 0) < 2,
                }
            }

        def route(s):
            if s.get("checks", {}).get("reflection_needed"):
                return {"next": "reflect"}
            if "compar" in s["question"].lower() or len(s["evidence"]) > 2:
                return {"next": "analyze"}
            return {"next": "synthesize"}

        nodes = {
            "plan": lambda s: {
                "plan": ["Retrieve source passages", "Inspect provenance", "Synthesize with citations"]
            },
            "retrieve": retrieve,
            "analyze": lambda s: {
                "analysis": {
                    "papers": [e["title"] for e in s["evidence"]],
                    "note": "Source inventory only; agreement and contradiction require semantic or human review",
                }
            },
            "fact_check": fact_check,
            "reflect": reflect,
            "route": route,
            "synthesize": lambda s: {"answer": self.generator.generate(s["question"], s["evidence"])},
            "remember": lambda s: {
                "memory": (
                    s.get("memory", [])
                    + [{"question": s["question"], "paper_ids": [e["paper_id"] for e in s["evidence"]]}]
                )[-10:]
            },
        }
        for name, fn in nodes.items():
            graph.add_node(name, self._node(name, fn))
        graph.add_edge(START, "plan")
        graph.add_edge("plan", "retrieve")
        if architecture == "single":
            graph.add_edge("retrieve", "synthesize")
        elif architecture == "supervisor":
            graph.add_edge("retrieve", "fact_check")
            graph.add_conditional_edges(
                "fact_check",
                lambda s: "reflect" if s["checks"]["reflection_needed"] else "synthesize",
                ["reflect", "synthesize"],
            )
            graph.add_edge("reflect", "fact_check")
        elif architecture == "hierarchical":
            graph.add_edge("retrieve", "analyze")
            graph.add_edge("analyze", "fact_check")
            graph.add_edge("fact_check", "synthesize")
        elif architecture == "swarm":
            graph.add_edge("retrieve", "fact_check")
            graph.add_edge("fact_check", "route")
            graph.add_conditional_edges("route", lambda s: s["next"], ["reflect", "analyze", "synthesize"])
            graph.add_edge("reflect", "fact_check")
            graph.add_edge("analyze", "synthesize")
        else:
            raise ValueError("Unknown architecture")
        graph.add_edge("synthesize", "remember")
        graph.add_edge("remember", END)
        return graph.compile(checkpointer=self.checkpointer)

    def investigate(
        self,
        question: str,
        architecture: Literal["single", "supervisor", "hierarchical", "swarm"],
        mode: str = "hybrid",
        k: int = 4,
        thread_id: str = "default",
        rewrite: bool = True,
        rerank: bool = False,
    ) -> dict:
        if architecture not in self.graphs:
            self.graphs[architecture] = self._compile(architecture)
        state = self.graphs[architecture].invoke(
            {
                "question": question,
                "mode": mode,
                "k": k,
                "rewrite": rewrite,
                "rerank": rerank,
                "trace": [],
                "attempts": 0,
                "evidence": [],
                "checks": {},
                "analysis": {},
                "plan": [],
                "answer": {},
                "next": "",
            },
            {"configurable": {"thread_id": f"{architecture}:{thread_id}"}, "recursion_limit": 20},
        )
        return {
            "id": str(uuid.uuid4()),
            "created": datetime.now(UTC).isoformat(),
            "architecture": architecture,
            "routing": "deterministic bounded workflow",
            "question": question,
            "evidence": state["evidence"],
            "trace": state["trace"],
            "memory": state.get("memory", []),
            **state["answer"],
        }
