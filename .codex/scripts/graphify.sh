#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
venv_dir="${repo_root}/.graphify-venv"
graph_dir="${repo_root}/graphify-out"
python_record="${repo_root}/.graphify_python"
graph_python_record="${graph_dir}/.graphify_python"
current_dir="$(pwd -P)"

is_compatible_python() {
  local candidate="${1}"
  "${candidate}" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' >/dev/null 2>&1
}

pick_base_python() {
  local candidates=()

  if [[ -n "${GRAPHIFY_PYTHON:-}" ]]; then
    candidates+=("${GRAPHIFY_PYTHON}")
  fi

  candidates+=("python3.13" "python3.12" "python3.11" "python3.10" "python3" "python")

  local candidate
  for candidate in "${candidates[@]}"; do
    if command -v "${candidate}" >/dev/null 2>&1 && is_compatible_python "${candidate}"; then
      command -v "${candidate}"
      return 0
    fi
  done

  return 1
}

ensure_env() {
  mkdir -p "${graph_dir}"

  if [[ -x "${venv_dir}/bin/python" ]] && is_compatible_python "${venv_dir}/bin/python"; then
    :
  else
    local base_python
    if ! base_python="$(pick_base_python)"; then
      echo "[graphify] Python 3.10+ is required. Install python3.10+ or set GRAPHIFY_PYTHON." >&2
      exit 1
    fi

    echo "[graphify] creating local virtualenv at ${venv_dir}" >&2
    rm -rf "${venv_dir}"
    "${base_python}" -m venv "${venv_dir}"
  fi

  local venv_python="${venv_dir}/bin/python"

  if ! "${venv_python}" -c 'import graphify' >/dev/null 2>&1; then
    echo "[graphify] installing graphifyy into ${venv_dir}" >&2
    "${venv_python}" -m pip install --upgrade pip >/dev/null
    "${venv_python}" -m pip install graphifyy >/dev/null
  fi

  printf '%s\n' "${venv_python}" > "${python_record}"
  printf '%s\n' "${venv_python}" > "${graph_python_record}"
  if [[ "${current_dir}" == "${repo_root}" || "${current_dir}" == "${repo_root}/"* ]]; then
    printf '%s\n' "${venv_python}" > "${current_dir}/.graphify_python"
  fi
  printf '%s\n' "${venv_python}"
}

main() {
  local command="${1:-run}"

  case "${command}" in
    ensure-env)
      ensure_env
      ;;
    build-local)
      shift
      local python_bin
      python_bin="$(ensure_env)"
      cd "${repo_root}"
      exec "${python_bin}" "${repo_root}/.codex/scripts/graphify-local-run.py" "$@"
      ;;
    -h|--help|install|query|save-result|benchmark|hook|gemini|cursor|claude|codex|opencode|aider|copilot|claw|droid|trae|trae-cn)
      local python_bin
      python_bin="$(ensure_env)"
      cd "${repo_root}"
      exec "${python_bin}" -m graphify "$@"
      ;;
    *)
      echo "[graphify] Use 'build-local' for the repo-local full build pipeline, or the \$graphify skill for the interactive/manual workflow." >&2
      echo "[graphify] This wrapper also provisions the local interpreter and exposes graphify CLI subcommands like query, hook, and benchmark." >&2
      exit 64
      ;;
  esac
}

main "$@"
