#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${FOUNDEROS_BASE_URL:-}"
WRITE_KEY="${FOUNDEROS_WRITE_KEY:-}"

if [[ -z "${BASE_URL}" ]]; then
  echo "FOUNDEROS_BASE_URL is required" >&2
  exit 1
fi

if [[ -z "${WRITE_KEY}" ]]; then
  echo "FOUNDEROS_WRITE_KEY is required" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <capabilities|plan|repo-file|repo-tree|execute> [args...]" >&2
  exit 1
fi

cmd="$1"
shift || true

auth_header=(-H "x-founderos-key: ${WRITE_KEY}" -H "content-type: application/json")

case "${cmd}" in
  capabilities)
    curl -sS "${BASE_URL}/api/founderos/capabilities"
    ;;
  plan)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 plan \"user request\"" >&2
      exit 1
    fi
    request="$1"
    request_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${request}")"
    curl -sS "${auth_header[@]}" \
      -d "{\"user_request\":${request_json}}" \
      "${BASE_URL}/api/founderos/precommit/plan"
    ;;
  repo-file)
    if [[ $# -lt 2 ]]; then
      echo "usage: $0 repo-file owner/repo path [ref]" >&2
      exit 1
    fi
    repo="$1"
    path="$2"
    ref="${3:-main}"
    repo_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${repo}")"
    path_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${path}")"
    ref_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${ref}")"
    curl -sS "${auth_header[@]}" \
      -d "{\"repo\":${repo_json},\"path\":${path_json},\"ref\":${ref_json}}" \
      "${BASE_URL}/api/founderos/repo/file"
    ;;
  repo-tree)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 repo-tree owner/repo [ref] [path_prefix] [limit]" >&2
      exit 1
    fi
    repo="$1"
    ref="${2:-main}"
    path_prefix="${3:-}"
    limit="${4:-200}"
    repo_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${repo}")"
    ref_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${ref}")"
    prefix_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${path_prefix}")"
    curl -sS "${auth_header[@]}" \
      -d "{\"repo\":${repo_json},\"ref\":${ref_json},\"path_prefix\":${prefix_json},\"limit\":${limit}}" \
      "${BASE_URL}/api/founderos/repo/tree"
    ;;
  execute)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 execute /path/to/payload.json" >&2
      exit 1
    fi
    payload_file="$1"
    curl -sS "${auth_header[@]}" \
      --data @"${payload_file}" \
      "${BASE_URL}/api/founderos/commit/execute"
    ;;
  *)
    echo "unknown command: ${cmd}" >&2
    exit 1
    ;;
esac
