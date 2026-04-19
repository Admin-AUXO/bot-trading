#!/usr/bin/env python3
"""
Graph Optimize Pipeline
Multi-agent orchestration for token-efficient, machine-readable graph output.

Agents:
  1. DataPruner   - removes redundancies, normalizes labels, deduplicates
  2. SchemaOptimizer - creates compact structured schema from graph
  3. SemanticEnricher - adds cross-links, metadata, semantic tags
"""

from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

# ----------------------------------------------------------------------
# Schema Types
# ----------------------------------------------------------------------


@dataclass
class OptimizedNode:
    id: str
    label: str
    short_label: str
    file: str
    location: str | None = None
    community_id: int | None = None
    community_label: str | None = None
    semantic_type: str | None = None  # "function", "class", "client", "service", etc.
    edges: int = 0
    centrality: float = 0.0
    is_god_node: bool = False
    inferred_edges: int = 0


@dataclass
class OptimizedEdge:
    source: str
    target: str
    rel_type: str  # "calls", "imports", "references", "builds-on"
    source_file: str | None = None
    confidence: float = 1.0  # 1.0=extracted, <1.0=inferred
    is_surprising: bool = False


@dataclass
class OptimizedCommunity:
    id: int
    label: str
    short_label: str
    cohesion: float
    node_count: int
    god_nodes: list[str] = field(default_factory=list)
    semantic_tags: list[str] = field(
        default_factory=list
    )  # "api", "service", "util", etc.
    cross_communities: list[int] = field(
        default_factory=list
    )  # communities this bridges to


@dataclass
class GraphOptimizedSchema:
    version: str = "2.0"
    generated: str = ""
    corpus: dict = field(default_factory=dict)
    stats: dict = field(default_factory=dict)
    nodes: list[OptimizedNode] = field(default_factory=list)
    edges: list[OptimizedEdge] = field(default_factory=list)
    communities: list[OptimizedCommunity] = field(default_factory=list)
    god_nodes: list[dict] = field(default_factory=list)
    surprising: list[dict] = field(default_factory=list)
    questions: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "generated": self.generated,
            "corpus": self.corpus,
            "stats": self.stats,
            "nodes": [
                {
                    "id": n.id,
                    "label": n.label,
                    "short": n.short_label,
                    "file": n.file,
                    "loc": n.location,
                    "comm": n.community_id,
                    "commLabel": n.community_label,
                    "type": n.semantic_type,
                    "edges": n.edges,
                    "centrality": round(n.centrality, 4),
                    "god": n.is_god_node,
                    "inferred": n.inferred_edges,
                }
                for n in self.nodes
            ],
            "edges": [
                {
                    "src": e.source,
                    "tgt": e.target,
                    "rel": e.rel_type,
                    "file": e.source_file,
                    "conf": round(e.confidence, 2),
                    "surprise": e.is_surprising,
                }
                for e in self.edges
            ],
            "communities": [
                {
                    "id": c.id,
                    "label": c.label,
                    "short": c.short_label,
                    "cohesion": round(c.cohesion, 3),
                    "nodes": c.node_count,
                    "gods": c.god_nodes,
                    "tags": c.semantic_tags,
                    "bridges": c.cross_communities,
                }
                for c in self.communities
            ],
            "gods": self.god_nodes,
            "surprises": self.surprising,
            "questions": self.questions,
        }


# ----------------------------------------------------------------------
# Data Pruner
# ----------------------------------------------------------------------

LABEL_SHORTEN_MAP = {
    "Tradingbot / Src": "TB/Src",
    "Tradingbot / Scripts": "TB/Scripts",
    "Tradingbot / Grafana": "TB/Grafana",
    "Tradingbot / Components": "TB/UI",
    "Tradingbot / Lib": "TB/Lib",
    "Tradingbot / Workbench": "TB/WBench",
    "Adaptive / Tradingbot": "Adaptive",
    "Workbench / Tradingbot": "WBench/TB",
    "Scripts / Claudeharness": "Scripts/Clwd",
}


def normalize_community_label(label: str) -> str:
    return LABEL_SHORTEN_MAP.get(label, label)


def extract_semantic_type(label: str, file: str) -> str | None:
    """Infer semantic type from label and file path."""
    label_lower = label.lower()
    file_lower = file.lower()

    if any(x in label_lower for x in ["client", "fetcher", "loader"]):
        return "client"
    if any(x in label_lower for x in ["service", "engine", "runner", "watcher"]):
        return "service"
    if any(x in label_lower for x in ["build", "create", "make", "generate", "format"]):
        return "builder"
    if any(x in label_lower for x in ["parse", "read", "load", "fetch"]):
        return "parser"
    if label.endswith("()"):
        return "function"
    if label[0].isupper() and not "(" in label:
        return "class"
    if any(x in file_lower for x in ["dashboard", "page", "component"]):
        return "ui"
    return None


def prune_duplicate_hubs(hubs: list[str]) -> list[str]:
    """Remove duplicate community hub entries."""
    seen = set()
    pruned = []
    for h in hubs:
        if h not in seen:
            seen.add(h)
            pruned.append(h)
    return pruned


def count_inferred_edges(node_id: str, edges: list[dict]) -> int:
    """Count inferred edges for a node. Handles both string ('INFERRED') and numeric confidence."""
    return sum(
        1
        for e in edges
        if e.get("source") == node_id
        and (
            e.get("confidence") == "INFERRED"
            or (
                isinstance(e.get("confidence"), (int, float))
                and e.get("confidence", 1) < 1
            )
        )
    )


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def normalize_confidence(edge: dict) -> float:
    """
    Normalize edge confidence to a float.
    Handles graphify's dual confidence format:
      - 'confidence' field: 'INFERRED' or 'EXTRACTED' (string)
      - 'confidence_score' field: numeric value (0.0-1.0)
    Returns float 0.0-1.0 where 1.0=extracted, <1.0=inferred.
    """
    conf = edge.get("confidence", "")
    if conf == "INFERRED":
        return edge.get("confidence_score", 0.8)
    if conf == "EXTRACTED":
        return 1.0
    # Fallback: treat numeric confidence directly
    numeric = edge.get("confidence", 1.0)
    if isinstance(numeric, (int, float)):
        return float(numeric)
    return 1.0


# ----------------------------------------------------------------------
# Schema Optimizer
# ----------------------------------------------------------------------


def compute_community_bridges(
    communities: dict[int, list[str]], edges: list[dict]
) -> dict[int, set[int]]:
    """Find which communities each community bridges to."""
    node_to_comm: dict[str, int] = {}
    for cid, nodes in communities.items():
        for n in nodes:
            node_to_comm[n] = cid

    bridges: dict[int, set[int]] = {cid: set() for cid in communities}
    for edge in edges:
        src_comm = node_to_comm.get(edge.get("source"))
        tgt_comm = node_to_comm.get(edge.get("target"))
        if src_comm is not None and tgt_comm is not None and src_comm != tgt_comm:
            bridges[src_comm].add(tgt_comm)
            bridges[tgt_comm].add(src_comm)
    return bridges


def derive_community_tags(
    community_nodes: list[dict], community_label: str
) -> list[str]:
    """Derive semantic tags for a community."""
    tags: set[str] = set()
    label_lower = community_label.lower()

    if "src" in label_lower or "lib" in label_lower:
        tags.add("backend")
    if "component" in label_lower or "ui" in label_lower:
        tags.add("frontend")
    if "dashboard" in label_lower or "grafana" in label_lower:
        tags.add("observability")
    if "script" in label_lower:
        tags.add("automation")
    if "adaptive" in label_lower:
        tags.add("ai")

    # Analyze node names
    node_labels = [n.get("label", "").lower() for n in community_nodes]
    if any("client" in l for l in node_labels):
        tags.add("client")
    if any("service" in l for l in node_labels):
        tags.add("service")
    if any("dashboard" in l or "page" in l for l in node_labels):
        tags.add("ui")

    return sorted(tags)


# ----------------------------------------------------------------------
# Semantic Enricher
# ----------------------------------------------------------------------


def compute_node_centrality(graph_data: dict) -> dict[str, float]:
    """Compute betweenness centrality for nodes."""
    try:
        import networkx as nx

        G = nx.Graph()
        for node in graph_data.get("nodes", []):
            G.add_node(node["id"])
        for edge in graph_data.get("links", []):
            if "source" in edge and "target" in edge:
                G.add_edge(edge["source"], edge["target"])

        if G.number_of_nodes() == 0:
            return {}
        centrality = nx.betweenness_centrality(G, normalized=True)
        return centrality
    except Exception:
        return {}


def enrich_surprising_connections(
    surprises: list[dict],
    node_id_map: dict[str, str],
    get_src=None,
    get_tgt=None,
) -> list[dict]:
    """Enrich surprising connections with compact metadata."""
    if get_src is None:
        get_src = lambda s: s.get("source_node", "")
    if get_tgt is None:
        get_tgt = lambda s: s.get("target_node", "")

    enriched = []
    for s in surprises:
        raw_src = get_src(s)
        raw_tgt = get_tgt(s)
        src = node_id_map.get(raw_src, raw_src)
        tgt = node_id_map.get(raw_tgt, raw_tgt)
        enriched.append(
            {
                "src": src,
                "tgt": tgt,
                "srcFile": s.get("source_file", "").split("/")[-1]
                if s.get("source_file")
                else "",
                "tgtFile": s.get("target_file", "").split("/")[-1]
                if s.get("target_file")
                else "",
                "rel": s.get("relationship") or s.get("relation", "calls"),
                "conf": normalize_confidence(s),
            }
        )
    return enriched


# ----------------------------------------------------------------------
# Pipeline Orchestration
# ----------------------------------------------------------------------


def run_optimization_pipeline(
    graph_json_path: Path,
    detection_result: dict,
    extraction: dict,
    communities: dict[int, list[str]],
    cohesion: dict[int, float],
    community_labels: dict[int, str],
    gods: list[dict],
    surprises: list[dict],
    questions: list[dict],
) -> GraphOptimizedSchema:
    """
    Multi-agent pipeline:
      1. DataPruner: normalize, deduplicate
      2. SchemaOptimizer: structure into compact schema
      3. SemanticEnricher: add metadata, cross-links
    """
    from datetime import datetime, timezone

    graph_data = json.loads(graph_json_path.read_text(encoding="utf-8"))
    node_id_map = {n["id"]: n["label"] for n in graph_data.get("nodes", [])}

    # --- Data Pruner Phase ---
    nodes_by_comm: dict[int, list[dict]] = {cid: [] for cid in communities}
    for node in graph_data.get("nodes", []):
        cid = node.get("community")
        if cid in nodes_by_comm:
            nodes_by_comm[cid].append(node)

    centrality = compute_node_centrality(graph_data)
    bridges = compute_community_bridges(communities, graph_data.get("links", []))

    # --- Schema Optimizer Phase ---
    optimized_nodes: list[OptimizedNode] = []
    for node in graph_data.get("nodes", []):
        nid = node["id"]
        label = node.get("label", "")
        file = node.get("source_file", "")
        comm_id = node.get("community")
        comm_label = normalize_community_label(
            community_labels.get(comm_id, f"Comm {comm_id}")
        )

        sem_type = extract_semantic_type(label, file)
        edge_count = sum(
            1
            for e in graph_data.get("links", [])
            if e.get("source") == nid or e.get("target") == nid
        )
        inferred = count_inferred_edges(nid, graph_data.get("links", []))

        # Determine if this is a god node
        # Method 1: Check if node_id appears in gods list (gods may be list of dicts or strings)
        is_god = False
        for g in gods:
            if isinstance(g, dict):
                if g.get("node_id") == nid or g.get("id") == nid:
                    is_god = True
                    break
            elif isinstance(g, str) and g == nid:
                is_god = True
                break
        # Method 2: High centrality nodes are god nodes (if centrality was computed)
        node_centrality = centrality.get(nid, 0.0) if centrality else 0.0
        if node_centrality >= 0.05:
            is_god = True
        # Method 3: Fallback - nodes with very high edge count are god nodes
        # (used when networkx centrality is not available)
        if not is_god and edge_count >= 30:
            is_god = True

        optimized_nodes.append(
            OptimizedNode(
                id=nid,
                label=label,
                short_label=label[:40] + "..." if len(label) > 40 else label,
                file=file,
                location=node.get("source_location"),
                community_id=comm_id,
                community_label=comm_label,
                semantic_type=sem_type,
                edges=edge_count,
                centrality=centrality.get(nid, 0.0),
                is_god_node=is_god,
                inferred_edges=inferred,
            )
        )

    # Sort nodes by centrality descending
    optimized_nodes.sort(key=lambda n: n.centrality, reverse=True)

    # Optimize edges
    optimized_edges: list[OptimizedEdge] = []
    seen_edges: set[tuple[str, str]] = set()
    for edge in graph_data.get("links", []):
        src = edge.get("source", "")
        tgt = edge.get("target", "")
        if not src or not tgt:
            continue
        key = tuple(sorted([src, tgt]))
        if key in seen_edges:
            continue
        seen_edges.add(key)

        rel_type = edge.get("relationship", "calls")
        if not rel_type or rel_type == "unknown":
            rel_type = "calls"

        surprise_entry = next(
            (
                s
                for s in surprises
                if s.get("source_node") == src and s.get("target_node") == tgt
            ),
            None,
        )

        optimized_edges.append(
            OptimizedEdge(
                source=src,
                target=tgt,
                rel_type=rel_type,
                source_file=edge.get("source_file", ""),
                confidence=normalize_confidence(edge),
                is_surprising=surprise_entry is not None,
            )
        )

    # Optimize communities
    optimized_communities: list[OptimizedCommunity] = []
    for cid, nodes in communities.items():
        comm_nodes_data = nodes_by_comm.get(cid, [])
        node_ids = [n["id"] for n in comm_nodes_data]
        label = normalize_community_label(community_labels.get(cid, f"Community {cid}"))
        # Collect god node IDs for this community - handle both string and dict gods
        gd_ids = []
        for g in gods:
            if isinstance(g, dict):
                gid = g.get("node_id") or g.get("id", "")
            elif isinstance(g, str):
                gid = g
            else:
                continue
            if gid in node_ids:
                gd_ids.append(gid)
        god_node_ids = gd_ids[:5]

        optimized_communities.append(
            OptimizedCommunity(
                id=cid,
                label=community_labels.get(cid, f"Community {cid}"),
                short_label=label,
                cohesion=cohesion.get(cid, 0.0),
                node_count=len(nodes),
                god_nodes=god_node_ids,
                semantic_tags=derive_community_tags(
                    comm_nodes_data, community_labels.get(cid, "")
                ),
                cross_communities=sorted(bridges.get(cid, set())),
            )
        )

    # Sort communities by node_count descending
    optimized_communities.sort(key=lambda c: c.node_count, reverse=True)

    # Build god nodes from optimized_nodes where is_god_node=True
    # (optimized_nodes has correct centrality and edge data)
    god_nodes_sorted = sorted(
        [n for n in optimized_nodes if n.is_god_node],
        key=lambda n: n.centrality,
        reverse=True,
    )
    optimized_gods = [
        {
            "id": n.id,
            "label": n.label,
            "edges": n.edges,
            "centrality": round(n.centrality, 4),
            "comm": n.community_id,
        }
        for n in god_nodes_sorted[:20]
    ]

    # --- Semantic Enricher Phase ---
    # graphify's surprises may use 'source_node'/'target_node' or 'source'/'target'
    def get_surprise_src(s):
        return s.get("source_node") or s.get("source", "")

    def get_surprise_tgt(s):
        return s.get("target_node") or s.get("target", "")

    enriched_surprises = enrich_surprising_connections(
        surprises, node_id_map, get_surprise_src, get_surprise_tgt
    )

    # Optimize questions - make them compact
    optimized_questions = []
    for q in questions:
        q_text = q.get("question", "")
        # Truncate long community lists
        if len(q_text) > 200:
            q_text = q_text[:200] + "..."
        optimized_questions.append(
            {
                "q": q_text,
                "type": q.get("type", "bridge"),
                "centrality": round(q.get("centrality", 0), 4)
                if q.get("centrality")
                else None,
                "inferred": q.get("inferred_edges", 0),
            }
        )

    # --- Build Schema ---
    schema = GraphOptimizedSchema(
        version="2.0",
        generated=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        corpus={
            "files": detection_result.get("total_files", 0),
            "words": detection_result.get("total_words", 0),
        },
        stats={
            "nodes": len(optimized_nodes),
            "edges": len(optimized_edges),
            "communities": len(optimized_communities),
            "extracted": sum(1 for e in optimized_edges if e.confidence == 1.0),
            "inferred": sum(1 for e in optimized_edges if e.confidence < 1.0),
        },
        nodes=optimized_nodes,
        edges=optimized_edges,
        communities=optimized_communities,
        god_nodes=optimized_gods,
        surprising=enriched_surprises,
        questions=optimized_questions,
    )

    return schema


# ----------------------------------------------------------------------
# Compact Markdown Generator
# ----------------------------------------------------------------------


def generate_compact_markdown(schema: GraphOptimizedSchema) -> str:
    """Generate token-optimized markdown from schema."""
    lines = [
        "# Graph Report",
        "",
        "## Corpus",
        f"- {schema.corpus['files']} files · ~{schema.corpus['words']:,} words",
        "",
        "## Stats",
        f"- {schema.stats['nodes']} nodes · {schema.stats['edges']} edges · {schema.stats['communities']} communities",
        f"- EXTRACTED: {schema.stats['extracted']} · INFERRED: {schema.stats['inferred']}",
        "",
        "## God Nodes",
        "| # | Node | Edges | Cent | Comm |",
        "|---|------|-------|------|------|",
    ]

    for i, god in enumerate(schema.god_nodes[:10], 1):
        comm = next(
            (c.short_label for c in schema.communities if c.id == god["comm"]),
            str(god["comm"]) if god["comm"] is not None else "-",
        )
        lines.append(
            f"| {i} | `{god['label']}` | {god['edges']} | {god['centrality']:.3f} | {comm} |"
        )

    lines.extend(
        [
            "",
            "## Communities",
            "",
            "| # | Label | Nodes | Cohesion | Tags | Bridges |",
            "|---|-------|-------|---------|------|---------|",
        ]
    )

    for i, comm in enumerate(schema.communities, 1):
        tags = ",".join(comm.semantic_tags[:3]) if comm.semantic_tags else "-"
        bridges = ",".join(str(b) for b in comm.cross_communities[:3])
        lines.append(
            f"| {i} | {comm.short_label} | {comm.node_count} | {comm.cohesion:.3f} | {tags} | {bridges} |"
        )

    if schema.surprising:
        lines.extend(
            [
                "",
                "## Surprising Connections",
                "",
                "| Source → Target | File | Conf |",
                "|------------------|------|------|",
            ]
        )
        for s in schema.surprising[:10]:
            lines.append(
                f"| `{s['src']}` → `{s['tgt']}` | {s['srcFile']}→{s['tgtFile']} | {s['conf']:.1f} |"
            )

    if schema.questions:
        lines.extend(["", "## Questions", ""])
        for q in schema.questions[:8]:
            q_type = f"[{q['type']}]" if q.get("type") else ""
            q_inf = f" ({q['inferred']} inferred)" if q.get("inferred") else ""
            lines.append(f"- **{q_type}{q['q']}{q_inf}**")

    lines.extend(
        [
            "",
            "---",
            f"_Generated: {schema.generated}_",
            "_Schema: graphify-out/GRAPH_SCHEMA.json_",
        ]
    )
    return "\n".join(lines) + "\n"
