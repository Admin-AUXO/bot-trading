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
MIN_REPORT_COMMUNITY_SIZE = 3


def filter_empty_communities(communities: dict[int, list[str]]) -> dict[int, list[str]]:
    return {cid: nodes for cid, nodes in communities.items() if nodes}


def filter_report_communities(communities: dict[int, list[str]]) -> dict[int, list[str]]:
    trimmed = {cid: nodes for cid, nodes in communities.items() if len(nodes) >= MIN_REPORT_COMMUNITY_SIZE}
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
                node_line = next((entry for entry in block if entry.startswith("Nodes (")), "")
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
    write_json(repo_root / ".graphify_labels.json", {str(cid): label for cid, label in labels.items()})

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
        {"input": extraction.get("input_tokens", 0), "output": extraction.get("output_tokens", 0)},
        str(target),
        suggested_questions=questions,
    )
    (out_dir / "GRAPH_REPORT.md").write_text(trim_report_noise(report), encoding="utf-8")
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
    report_path = out_dir / "GRAPH_REPORT.md"
    report_path.write_text(trim_report_noise(report_path.read_text(encoding="utf-8")), encoding="utf-8")

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
