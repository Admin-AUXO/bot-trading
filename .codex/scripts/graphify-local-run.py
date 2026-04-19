#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

import networkx as nx

from graphify.analyze import god_nodes, suggest_questions, surprising_connections
from graphify.benchmark import print_benchmark, run_benchmark
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.detect import detect, save_manifest
from graphify.export import to_html, to_json
from graphify.extract import extract
from graphify.report import generate

from graph_optimize import (
    run_optimization_pipeline,
    generate_compact_markdown,
)


TEMP_FILES = (
    ".graphify_detect.json",
    ".graphify_ast.json",
    ".graphify_semantic.json",
    ".graphify_extract.json",
    ".graphify_analysis.json",
    ".graphify_labels.json",
)

# Output files that are part of the optimization pipeline
OPTIMIZED_OUTPUTS = ("GRAPH_SCHEMA.json", "GRAPH_REPORT_COMPACT.md")
COMMON_LABEL_STOPWORDS = {
    "api",
    "app",
    "backend",
    "bot",
    "build",
    "code",
    "codex",
    "dashboard",
    "default",
    "file",
    "files",
    "graph",
    "graphify",
    "guide",
    "local",
    "readme",
    "repo",
    "root",
    "rules",
    "runtime",
    "source",
    "stack",
    "task",
    "trading",
    "types",
}
MIN_REPORT_COMMUNITY_SIZE = 3


def filter_empty_communities(communities: dict[int, list[str]]) -> dict[int, list[str]]:
    return {cid: nodes for cid, nodes in communities.items() if nodes}


def filter_report_communities(
    communities: dict[int, list[str]],
) -> dict[int, list[str]]:
    trimmed = {
        cid: nodes
        for cid, nodes in communities.items()
        if len(nodes) >= MIN_REPORT_COMMUNITY_SIZE
    }
    return trimmed or communities


def keep_code_only(detection_result: dict) -> dict:
    detection_result["files"]["document"] = []
    detection_result["files"]["paper"] = []
    detection_result["files"]["image"] = []
    detection_result["total_files"] = len(detection_result["files"].get("code", []))
    detection_result["needs_graph"] = True
    detection_result["warning"] = None
    return detection_result


def auto_label_communities(graph, communities: dict[int, list[str]]) -> dict[int, str]:
    labels: dict[int, str] = {}
    for cid, node_ids in communities.items():
        counter: Counter[str] = Counter()
        for node_id in node_ids:
            data = graph.nodes[node_id]
            source_file = data.get("source_file", "")
            for part in Path(source_file).parts:
                token = re.sub(r"[^a-z0-9]+", "", part.lower())
                if len(token) > 2 and token not in COMMON_LABEL_STOPWORDS:
                    counter[token] += 2
            for token in re.findall(r"[A-Za-z0-9]+", data.get("label", "").lower()):
                if len(token) > 2 and token not in COMMON_LABEL_STOPWORDS:
                    counter[token] += 1
        winners = [token.capitalize() for token, _ in counter.most_common(2)]
        labels[cid] = " / ".join(winners) if winners else f"Community {cid}"
    return labels


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def stable_node_id(rel_posix: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", rel_posix.lower()).strip("_")


def repo_relative_posix(repo_root: Path, path_str: str) -> str | None:
    try:
        p = Path(path_str)
        if not p.is_absolute():
            p = (repo_root / p).resolve()
        else:
            p = p.resolve()
        rel = p.relative_to(repo_root.resolve())
        return rel.as_posix()
    except (ValueError, OSError):
        return None


def is_primary_file_node(attrs: dict, source_file: str) -> bool:
    label = attrs.get("label") or ""
    suf = Path(source_file).suffix
    return bool(suf) and label.endswith(suf)


def relativize_networkx_graph(graph: nx.Graph, repo_root: Path) -> None:
    """Use repo-relative paths in node/edge data; relabel file nodes to portable ids."""
    root = repo_root.resolve()
    id_map: dict[str, str] = {}

    for node_id, data in list(graph.nodes(data=True)):
        sf = data.get("source_file")
        if not isinstance(sf, str) or not sf:
            continue
        rel = repo_relative_posix(root, sf)
        if rel is None:
            continue
        original_sf = sf
        data["source_file"] = rel
        if is_primary_file_node(data, original_sf):
            new_id = stable_node_id(rel)
            if new_id and new_id != node_id:
                id_map[node_id] = new_id

    if len(set(id_map.values())) != len(id_map):
        id_map = {}

    if id_map:
        nx.relabel_nodes(graph, id_map, copy=False)

    for _u, _v, edge_data in graph.edges(data=True):
        sf = edge_data.get("source_file")
        if isinstance(sf, str):
            rel = repo_relative_posix(root, sf)
            if rel is not None:
                edge_data["source_file"] = rel
        for key in ("_src", "_tgt"):
            if key in edge_data and isinstance(edge_data[key], str):
                edge_data[key] = id_map.get(edge_data[key], edge_data[key])


def relativize_manifest_files_for_root(repo_root: Path, files: dict) -> dict:
    root = repo_root.resolve()
    out: dict = {}
    for category, items in files.items():
        if not isinstance(items, list):
            out[category] = items
            continue
        rel_list: list[str] = []
        for entry in items:
            if not isinstance(entry, str):
                continue
            rel = repo_relative_posix(root, entry)
            rel_list.append(rel if rel is not None else entry)
        out[category] = rel_list
    return out


def scrub_absolute_repo_paths(repo_root: Path, text: str) -> str:
    root = repo_root.resolve().as_posix()
    if not root or root == ".":
        return text
    text = text.replace(root + "/", "")
    return text.replace(root, ".")


def relativize_graph_json_file(repo_root: Path, graph_path: Path) -> None:
    if not graph_path.exists():
        return
    doc = json.loads(graph_path.read_text(encoding="utf-8"))
    root = repo_root.resolve()
    id_map: dict[str, str] = {}

    for node in doc.get("nodes", []):
        sf = node.get("source_file")
        if not isinstance(sf, str) or not sf:
            continue
        rel = repo_relative_posix(root, sf)
        if rel is None:
            continue
        original_sf = sf
        node["source_file"] = rel
        label = node.get("label") or ""
        suf = Path(original_sf).suffix
        old_id = node.get("id")
        if not isinstance(old_id, str):
            continue
        if suf and label.endswith(suf):
            new_id = stable_node_id(rel)
            if new_id and new_id != old_id:
                id_map[old_id] = new_id

    if len(set(id_map.values())) != len(id_map):
        id_map = {}

    for node in doc.get("nodes", []):
        old_id = node.get("id")
        if isinstance(old_id, str) and old_id in id_map:
            node["id"] = id_map[old_id]

    for link in doc.get("links", []):
        for key in ("source", "target", "_src", "_tgt"):
            if key in link and isinstance(link[key], str) and link[key] in id_map:
                link[key] = id_map[link[key]]
        sf = link.get("source_file")
        if isinstance(sf, str):
            rel = repo_relative_posix(root, sf)
            if rel is not None:
                link["source_file"] = rel

    for hyper in doc.get("hyperedges") or []:
        if not isinstance(hyper, dict):
            continue
        for key, val in list(hyper.items()):
            if isinstance(val, str):
                rel = repo_relative_posix(root, val)
                if rel is not None:
                    hyper[key] = rel
            elif isinstance(val, list):
                hyper[key] = [
                    (repo_relative_posix(root, v) or v) if isinstance(v, str) else v
                    for v in val
                ]

    graph_path.write_text(json.dumps(doc, indent=2), encoding="utf-8")


def relativize_manifest_json_file(repo_root: Path, manifest_path: Path) -> None:
    if not manifest_path.exists():
        return
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return
    root = repo_root.resolve()
    new_data: dict = {}
    for key, val in data.items():
        if not isinstance(key, str):
            new_data[key] = val
            continue
        rel = repo_relative_posix(root, key)
        new_data[rel if rel is not None else key] = val
    manifest_path.write_text(json.dumps(new_data, indent=2), encoding="utf-8")


def relativize_disk_outputs(repo_root: Path) -> None:
    """Post-process graphify-out after upstream graphify rebuild (library) runs."""
    out_dir = repo_root / "graphify-out"
    relativize_graph_json_file(repo_root, out_dir / "graph.json")
    relativize_manifest_json_file(repo_root, out_dir / "manifest.json")
    report_path = out_dir / "GRAPH_REPORT.md"
    if report_path.exists():
        report_path.write_text(
            scrub_absolute_repo_paths(
                repo_root, report_path.read_text(encoding="utf-8")
            ),
            encoding="utf-8",
        )
    html_path = out_dir / "graph.html"
    if html_path.exists():
        html_path.write_text(
            scrub_absolute_repo_paths(repo_root, html_path.read_text(encoding="utf-8")),
            encoding="utf-8",
        )


def report_scope_display(repo_root: Path, target: Path) -> str:
    try:
        return target.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError:
        return target.resolve().as_posix()


def update_cost(
    repo_root: Path, extraction: dict, detection_result: dict
) -> tuple[int, int, int]:
    cost_path = repo_root / "graphify-out" / "cost.json"
    if cost_path.exists():
        cost = json.loads(cost_path.read_text(encoding="utf-8"))
    else:
        cost = {"runs": [], "total_input_tokens": 0, "total_output_tokens": 0}

    input_tokens = extraction.get("input_tokens", 0)
    output_tokens = extraction.get("output_tokens", 0)
    cost["runs"].append(
        {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "files": detection_result.get("total_files", 0),
        }
    )
    cost["total_input_tokens"] += input_tokens
    cost["total_output_tokens"] += output_tokens
    write_json(cost_path, cost)
    return input_tokens, output_tokens, len(cost["runs"])


def cleanup(repo_root: Path) -> None:
    for name in TEMP_FILES:
        (repo_root / name).unlink(missing_ok=True)
    (repo_root / "graphify-out" / ".needs_update").unlink(missing_ok=True)


def trim_report_noise(report: str) -> str:
    lines = report.splitlines()
    trimmed: list[str] = []
    skip_knowledge_gap_block = False
    community_blocks: list[list[str]] = []
    current_block: list[str] | None = None
    kept_community_count = 0
    in_communities = False
    in_questions = False
    question_blocks: list[list[str]] = []
    current_question: list[str] | None = None

    for line in lines:
        if line.startswith("## Communities"):
            in_communities = True
            in_questions = False
            trimmed.append(line)
            continue
        if line.startswith("## Suggested Questions"):
            in_communities = False
            in_questions = True
            if current_block:
                community_blocks.append(current_block)
                current_block = None
            kept_blocks = []
            for block in community_blocks:
                node_line = next(
                    (entry for entry in block if entry.startswith("Nodes (")), ""
                )
                match = re.search(r"Nodes \((\d+)\)", node_line)
                node_count = int(match.group(1)) if match else 0
                if node_count >= MIN_REPORT_COMMUNITY_SIZE:
                    kept_blocks.append(block)
            kept_community_count = len(kept_blocks)
            for block in kept_blocks:
                trimmed.extend(block)
                trimmed.append("")
            trimmed.append(line)
            continue
        if line.startswith("## Knowledge Gaps"):
            skip_knowledge_gap_block = True
            continue
        if skip_knowledge_gap_block and line.startswith("## Suggested Questions"):
            skip_knowledge_gap_block = False
            continue
        if skip_knowledge_gap_block:
            continue
        if in_communities:
            if line.startswith("### Community "):
                if current_block:
                    community_blocks.append(current_block)
                current_block = [line]
            elif current_block is not None:
                current_block.append(line)
            continue
        if in_questions:
            if line.startswith("- **"):
                if current_question:
                    question_blocks.append(current_question)
                current_question = [line]
            elif current_question is not None:
                current_question.append(line)
            else:
                trimmed.append(line)
            continue
        trimmed.append(line)

    if current_question:
        question_blocks.append(current_question)

    deduped_questions: list[list[str]] = []
    seen_question_titles: set[str] = set()
    for block in question_blocks:
        title = block[0]
        if title in seen_question_titles:
            continue
        seen_question_titles.add(title)
        deduped_questions.append(block)

    for block in deduped_questions:
        trimmed.extend(block)

    cleaned = "\n".join(trimmed).strip() + "\n"
    if kept_community_count:
        cleaned = re.sub(
            r"(- \d+ nodes · \d+ edges · )\d+( communities detected)",
            rf"\g<1>{kept_community_count}\2",
            cleaned,
            count=1,
        )
    return cleaned


def run(args: argparse.Namespace) -> int:
    repo_root = Path(__file__).resolve().parents[2]
    target = (
        (repo_root / args.path).resolve()
        if not Path(args.path).is_absolute()
        else Path(args.path).resolve()
    )
    if not target.exists():
        raise SystemExit(f"[graphify] Target does not exist: {target}")

    detection_result = keep_code_only(detect(target))
    write_json(repo_root / ".graphify_detect.json", detection_result)

    code_files = [Path(path) for path in detection_result["files"].get("code", [])]
    ast_result = (
        extract(code_files)
        if code_files
        else {
            "nodes": [],
            "edges": [],
            "hyperedges": [],
            "input_tokens": 0,
            "output_tokens": 0,
        }
    )
    write_json(repo_root / ".graphify_ast.json", ast_result)

    semantic_result = {
        "nodes": [],
        "edges": [],
        "hyperedges": [],
        "input_tokens": 0,
        "output_tokens": 0,
    }
    write_json(repo_root / ".graphify_semantic.json", semantic_result)

    extraction = {
        "nodes": list(ast_result.get("nodes", [])),
        "edges": list(ast_result.get("edges", [])),
        "hyperedges": list(ast_result.get("hyperedges", [])),
        "input_tokens": ast_result.get("input_tokens", 0),
        "output_tokens": ast_result.get("output_tokens", 0),
    }
    write_json(repo_root / ".graphify_extract.json", extraction)

    graph = build_from_json(extraction)
    relativize_networkx_graph(graph, repo_root)
    raw_communities = cluster(graph)
    communities = filter_empty_communities(raw_communities)
    cohesion = score_all(graph, communities)
    labels = auto_label_communities(graph, communities)
    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)

    report_communities = filter_report_communities(communities)
    report_cohesion = {cid: cohesion[cid] for cid in report_communities}
    report_labels = {cid: labels[cid] for cid in report_communities}
    questions = suggest_questions(graph, report_communities, report_labels)

    analysis = {
        "communities": {str(cid): nodes for cid, nodes in communities.items()},
        "cohesion": {str(cid): score for cid, score in cohesion.items()},
        "gods": gods,
        "surprises": surprises,
    }
    write_json(repo_root / ".graphify_analysis.json", analysis)
    write_json(
        repo_root / ".graphify_labels.json",
        {str(cid): label for cid, label in labels.items()},
    )

    out_dir = repo_root / "graphify-out"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = generate(
        graph,
        report_communities,
        report_cohesion,
        report_labels,
        gods,
        surprises,
        detection_result,
        {
            "input": extraction.get("input_tokens", 0),
            "output": extraction.get("output_tokens", 0),
        },
        report_scope_display(repo_root, target),
        suggested_questions=questions,
    )
    (out_dir / "GRAPH_REPORT.md").write_text(
        trim_report_noise(report), encoding="utf-8"
    )
    to_json(graph, communities, str(out_dir / "graph.json"))

    # --- Multi-Agent Optimization Pipeline ---
    # Run optimization to produce compact machine-readable schema
    try:
        optimized_schema = run_optimization_pipeline(
            graph_json_path=out_dir / "graph.json",
            detection_result=detection_result,
            extraction=extraction,
            communities=communities,
            cohesion=cohesion,
            community_labels=labels,
            gods=gods,
            surprises=surprises,
            questions=questions,
        )
        # Write compact JSON schema for LLM agents
        (out_dir / "GRAPH_SCHEMA.json").write_text(
            json.dumps(optimized_schema.to_dict(), indent=2), encoding="utf-8"
        )
        # Write token-optimized markdown
        (out_dir / "GRAPH_REPORT_COMPACT.md").write_text(
            generate_compact_markdown(optimized_schema), encoding="utf-8"
        )
    except Exception as e:
        print(f"[graphify] Optimization pipeline skipped: {e}")

    html_written = True
    try:
        to_html(
            graph, communities, str(out_dir / "graph.html"), community_labels=labels
        )
    except ValueError:
        html_written = False

    if detection_result.get("total_words", 0) > 5000:
        print_benchmark(
            run_benchmark(
                str(out_dir / "graph.json"),
                corpus_words=detection_result["total_words"],
            )
        )

    save_manifest(
        relativize_manifest_files_for_root(repo_root, detection_result["files"]),
        manifest_path=str(out_dir / "manifest.json"),
    )
    input_tokens, output_tokens, total_runs = update_cost(
        repo_root, extraction, detection_result
    )
    if args.clean_temp:
        cleanup(repo_root)
    report_path = out_dir / "GRAPH_REPORT.md"
    report_path.write_text(
        trim_report_noise(report_path.read_text(encoding="utf-8")), encoding="utf-8"
    )

    relativize_disk_outputs(repo_root)

    # Remove redundant/large files that agents should not depend on
    # GRAPH_REPORT.md is superseded by GRAPH_REPORT_COMPACT.md
    # graph.html is 1.3MB+ interactive viz (rarely useful for agents)
    # cost.json accumulates zero-token runs (not actionable)
    # cache/ is intermediate build cache
    import shutil

    for name in ("GRAPH_REPORT.md", "graph.html", ".graphify_python"):
        (out_dir / name).unlink(missing_ok=True)
    (out_dir / "cost.json").unlink(missing_ok=True)
    shutil.rmtree(out_dir / "cache", ignore_errors=True)

    scope = report_scope_display(repo_root, target)
    print(f"[graphify] Graph complete for {scope}")
    print("[graphify] Scope: code files only")
    print(
        f"[graphify] Nodes: {graph.number_of_nodes()} | Edges: {graph.number_of_edges()} | Communities: {len(communities)}"
    )
    print(
        f"[graphify] Compact Report: graphify-out/GRAPH_REPORT_COMPACT.md (token-optimized)"
    )
    print(f"[graphify] Schema: graphify-out/GRAPH_SCHEMA.json (machine-readable)")
    print(f"[graphify] Agent Guide: graphify-out/README.md (quick-ref, schema guide)")
    print(f"[graphify] Graph JSON: graphify-out/graph.json")
    print(
        f"[graphify] Tokens: {input_tokens} input | {output_tokens} output | total runs: {total_runs}"
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Repo-local code-only graphify runner."
    )
    parser.add_argument(
        "path", nargs="?", default=".", help="Path to graph. Defaults to repo root."
    )
    parser.add_argument(
        "--relativize-out-only",
        action="store_true",
        help="Rewrite graphify-out artifacts to use paths relative to repo root (after graphify rebuild).",
    )
    parser.add_argument(
        "--clean-temp",
        action="store_true",
        default=True,
        help="Remove intermediate .graphify_*.json files after success.",
    )
    parser.add_argument(
        "--keep-temp",
        action="store_false",
        dest="clean_temp",
        help="Keep intermediate .graphify_*.json files for debugging.",
    )
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    if args.relativize_out_only:
        relativize_disk_outputs(repo_root)
        return 0
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
