#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
graph_path="${repo_root}/graphify-out/graph.json"
python_record="${repo_root}/.graphify_python"

if [[ ! -f "${graph_path}" ]]; then
  echo "[graphify] ${graph_path} is missing. Build the graph first with './.codex/scripts/graphify.sh build-local .' or the repo \$graphify skill." >&2
  exit 0
fi

python_bin="$("${repo_root}/.codex/scripts/graphify.sh" ensure-env)"

if [[ ! -f "${python_record}" ]]; then
  printf '%s\n' "${python_bin}" > "${python_record}"
fi

cd "${repo_root}"
"${python_bin}" -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
