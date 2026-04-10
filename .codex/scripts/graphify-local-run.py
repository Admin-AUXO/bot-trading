#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

from graphify.analyze import god_nodes, suggest_questions, surprising_connections
from graphify.benchmark import print_benchmark, run_benchmark
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.detect import detect, save_manifest
from graphify.export import to_html, to_json
from graphify.extract import extract
from graphify.report import generate


TEMP_FILES = (
    ".graphify_detect.json",
    ".graphify_ast.json",
    ".graphify_semantic.json",
    ".graphify_extract.json",
    ".graphify_analysis.json",
    ".graphify_labels.json",
)
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


def update_cost(repo_root: Path, extraction: dict, detection_result: dict) -> tuple[int, int, int]:
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


def run(args: argparse.Namespace) -> int:
    repo_root = Path(__file__).resolve().parents[2]
    target = (repo_root / args.path).resolve() if not Path(args.path).is_absolute() else Path(args.path).resolve()
    if not target.exists():
        raise SystemExit(f"[graphify] Target does not exist: {target}")

    detection_result = keep_code_only(detect(target))
    write_json(repo_root / ".graphify_detect.json", detection_result)

    code_files = [Path(path) for path in detection_result["files"].get("code", [])]
    ast_result = extract(code_files) if code_files else {"nodes": [], "edges": [], "hyperedges": [], "input_tokens": 0, "output_tokens": 0}
    write_json(repo_root / ".graphify_ast.json", ast_result)

    semantic_result = {"nodes": [], "edges": [], "hyperedges": [], "input_tokens": 0, "output_tokens": 0}
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
    communities = cluster(graph)
    cohesion = score_all(graph, communities)
    labels = auto_label_communities(graph, communities)
    gods = god_nodes(graph)
    surprises = surprising_connections(graph, communities)
    questions = suggest_questions(graph, communities, labels)

    analysis = {
        "communities": {str(cid): nodes for cid, nodes in communities.items()},
        "cohesion": {str(cid): score for cid, score in cohesion.items()},
        "gods": gods,
        "surprises": surprises,
    }
    write_json(repo_root / ".graphify_analysis.json", analysis)
    write_json(repo_root / ".graphify_labels.json", {str(cid): label for cid, label in labels.items()})

    out_dir = repo_root / "graphify-out"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = generate(
        graph,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detection_result,
        {"input": extraction.get("input_tokens", 0), "output": extraction.get("output_tokens", 0)},
        str(target),
        suggested_questions=questions,
    )
    (out_dir / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
    to_json(graph, communities, str(out_dir / "graph.json"))

    html_written = True
    try:
        to_html(graph, communities, str(out_dir / "graph.html"), community_labels=labels)
    except ValueError:
        html_written = False

    if detection_result.get("total_words", 0) > 5000:
        print_benchmark(run_benchmark(str(out_dir / "graph.json"), corpus_words=detection_result["total_words"]))

    save_manifest(detection_result["files"], manifest_path=str(out_dir / "manifest.json"))
    input_tokens, output_tokens, total_runs = update_cost(repo_root, extraction, detection_result)
    if args.clean_temp:
        cleanup(repo_root)

    print(f"[graphify] Graph complete for {target}")
    print("[graphify] Scope: code files only")
    print(f"[graphify] Nodes: {graph.number_of_nodes()} | Edges: {graph.number_of_edges()} | Communities: {len(communities)}")
    print(f"[graphify] Report: {out_dir / 'GRAPH_REPORT.md'}")
    print(f"[graphify] Graph JSON: {out_dir / 'graph.json'}")
    if html_written:
        print(f"[graphify] HTML: {out_dir / 'graph.html'}")
    else:
        print("[graphify] HTML skipped because the graph is too large for vis.js export.")
    print(f"[graphify] Tokens: {input_tokens} input | {output_tokens} output | total runs: {total_runs}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Repo-local code-only graphify runner.")
    parser.add_argument("path", nargs="?", default=".", help="Path to graph. Defaults to repo root.")
    parser.add_argument("--clean-temp", action="store_true", default=True, help="Remove intermediate .graphify_*.json files after success.")
    parser.add_argument("--keep-temp", action="store_false", dest="clean_temp", help="Keep intermediate .graphify_*.json files for debugging.")
    args = parser.parse_args()
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
