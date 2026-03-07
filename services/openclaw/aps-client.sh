#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${FOUNDEROS_BASE_URL:-}"
WRITE_KEY="${FOUNDEROS_PUBLIC_WRITE_KEY:-${FOUNDEROS_WRITE_KEY:-}}"
WORKER_KEY="${FOUNDEROS_WORKER_KEY:-}"
WORKER_ID="${FOUNDEROS_WORKER_ID:-openclaw-worker}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ -z "${BASE_URL}" ]]; then
  echo "FOUNDEROS_BASE_URL is required" >&2
  exit 1
fi

if [[ -z "${WRITE_KEY}" ]]; then
  echo "FOUNDEROS_PUBLIC_WRITE_KEY or FOUNDEROS_WRITE_KEY is required" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <capabilities|plan|repo-file|repo-tree|freeze|execute|merge-pr|submit|job-status|claim|heartbeat|complete|fail> [args...]" >&2
  exit 1
fi

cmd="$1"
shift || true

auth_header=(-H "x-founderos-key: ${WRITE_KEY}" -H "content-type: application/json")
worker_auth_header=(-H "x-founderos-worker-key: ${WORKER_KEY}" -H "x-founderos-worker-id: ${WORKER_ID}" -H "content-type: application/json")
worker_lifecycle_curl=(curl --fail-with-body -sS)

json_string() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${1:-}"
}

build_worker_runtime_json() {
  local commit_sha commit_source worker_version
  commit_sha="${FOUNDEROS_WORKER_COMMIT_SHA:-}"
  commit_source="${FOUNDEROS_WORKER_COMMIT_SOURCE:-}"
  worker_version="${FOUNDEROS_WORKER_VERSION:-worker-loop-v1}"

  if [[ -z "${commit_sha}" ]]; then
    if commit_sha="$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null)"; then
      commit_source="${commit_source:-git}"
    else
      commit_sha=""
      commit_source="${commit_source:-unknown}"
    fi
  fi

  node -e '
const payload = {
  worker_id: process.argv[1],
  worker_commit_sha: process.argv[2] || null,
  worker_commit_source: process.argv[3] || null,
  worker_version: process.argv[4] || null,
};
process.stdout.write(JSON.stringify(payload));
' "${WORKER_ID}" "${commit_sha}" "${commit_source}" "${worker_version}"
}

merge_payload_with_worker_runtime() {
  local runtime_json
  runtime_json="$(build_worker_runtime_json)"

  node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
const payload = JSON.parse(input || "{}");
const workerRuntime = JSON.parse(process.argv[1] || "{}");
payload.worker_runtime = workerRuntime;
process.stdout.write(JSON.stringify(payload));
' "${runtime_json}"
}

case "${cmd}" in
  capabilities)
    curl -sS "${BASE_URL}/api/founderos/capabilities"
    ;;
  plan)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 plan \"user request\"" >&2
      exit 1
    fi
    request_json="$(json_string "$1")"
    curl -sS "${auth_header[@]}" \
      -d "{\"user_request\":${request_json}}" \
      "${BASE_URL}/api/founderos/precommit/plan"
    ;;
  repo-file)
    if [[ $# -lt 2 ]]; then
      echo "usage: $0 repo-file owner/repo path [ref]" >&2
      exit 1
    fi
    repo_json="$(json_string "$1")"
    path_json="$(json_string "$2")"
    ref_json="$(json_string "${3:-main}")"
    curl -sS "${auth_header[@]}" \
      -d "{\"repo\":${repo_json},\"path\":${path_json},\"ref\":${ref_json}}" \
      "${BASE_URL}/api/founderos/repo/file"
    ;;
  repo-tree)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 repo-tree owner/repo [ref] [path_prefix] [limit]" >&2
      exit 1
    fi
    repo_json="$(json_string "$1")"
    ref_json="$(json_string "${2:-main}")"
    prefix_json="$(json_string "${3:-}")"
    limit="${4:-200}"
    curl -sS "${auth_header[@]}" \
      -d "{\"repo\":${repo_json},\"ref\":${ref_json},\"path_prefix\":${prefix_json},\"limit\":${limit}}" \
      "${BASE_URL}/api/founderos/repo/tree"
    ;;
  freeze)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 freeze /path/to/payload.json" >&2
      exit 1
    fi
    curl -sS "${auth_header[@]}" \
      --data @"$1" \
      "${BASE_URL}/api/founderos/commit/freeze-write-set"
    ;;
  execute)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 execute /path/to/payload.json" >&2
      exit 1
    fi
    curl -sS "${auth_header[@]}" \
      --data @"$1" \
      "${BASE_URL}/api/founderos/commit/execute"
    ;;
  merge-pr)
    if [[ $# -lt 4 ]]; then
      echo "usage: $0 merge-pr owner/repo <pull_number> <authorized_by> <expected_head_sha> [expected_base_branch]" >&2
      exit 1
    fi
    repo_json="$(json_string "$1")"
    pull_number="$2"
    authorized_by_json="$(json_string "$3")"
    expected_head_sha_json="$(json_string "$4")"
    expected_base_branch_json="$(json_string "${5:-main}")"
    curl -sS "${auth_header[@]}" \
      -d "{\"repo\":${repo_json},\"pull_number\":${pull_number},\"authorization\":{\"action\":\"merge_pull_request\",\"authorized_by\":${authorized_by_json},\"expected_head_sha\":${expected_head_sha_json},\"expected_base_branch\":${expected_base_branch_json},\"merge_method\":\"squash\"}}" \
      "${BASE_URL}/api/founderos/commit/merge-pr"
    ;;
  submit)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 submit \"user request\" [repo] [branch] [requested_by]" >&2
      exit 1
    fi
    request_json="$(json_string "$1")"
    repo_json="$(json_string "${2:-}")"
    branch_json="$(json_string "${3:-main}")"
    requested_by_json="$(json_string "${4:-openclaw}")"
    curl -sS "${auth_header[@]}" \
      -d "{\"user_request\":${request_json},\"scope\":{\"repo\":${repo_json},\"branch\":${branch_json}},\"requested_by\":${requested_by_json},\"requested_by_lane\":\"worker_bootstrap\",\"requested_by_subject_type\":\"worker\"}" \
      "${BASE_URL}/api/founderos/orchestrate/submit"
    ;;
  job-status)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 job-status <job_id>" >&2
      exit 1
    fi
    curl -sS -H "x-founderos-key: ${WRITE_KEY}" \
      "${BASE_URL}/api/founderos/orchestrate/jobs/$1"
    ;;
  claim)
    if [[ -z "${WORKER_KEY}" ]]; then
      echo "FOUNDEROS_WORKER_KEY is required" >&2
      exit 1
    fi
    "${worker_lifecycle_curl[@]}" "${worker_auth_header[@]}" \
      -d "{\"worker_runtime\":$(build_worker_runtime_json)}" \
      "${BASE_URL}/api/founderos/orchestrate/claim"
    ;;
  heartbeat)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 heartbeat <job_id> [status] [message] [progress]" >&2
      exit 1
    fi
    if [[ -z "${WORKER_KEY}" ]]; then
      echo "FOUNDEROS_WORKER_KEY is required" >&2
      exit 1
    fi
    job_id="$1"
    status_json="$(json_string "${2:-claimed}")"
    message_json="$(json_string "${3:-}")"
    progress="${4:-null}"
    "${worker_lifecycle_curl[@]}" "${worker_auth_header[@]}" \
      -d "{\"status\":${status_json},\"message\":${message_json},\"progress\":${progress},\"worker_runtime\":$(build_worker_runtime_json)}" \
      "${BASE_URL}/api/founderos/orchestrate/jobs/${job_id}/heartbeat"
    ;;
  complete)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 complete <job_id> [result-json-file]" >&2
      exit 1
    fi
    if [[ -z "${WORKER_KEY}" ]]; then
      echo "FOUNDEROS_WORKER_KEY is required" >&2
      exit 1
    fi
    job_id="$1"
    if [[ -n "${2:-}" ]]; then
      payload="$(merge_payload_with_worker_runtime < "$2")"
    else
      payload="$(printf '{}' | merge_payload_with_worker_runtime)"
    fi
    "${worker_lifecycle_curl[@]}" "${worker_auth_header[@]}" \
      --data "${payload}" \
      "${BASE_URL}/api/founderos/orchestrate/jobs/${job_id}/complete"
    ;;
  fail)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 fail <job_id> [result-json-file]" >&2
      exit 1
    fi
    if [[ -z "${WORKER_KEY}" ]]; then
      echo "FOUNDEROS_WORKER_KEY is required" >&2
      exit 1
    fi
    job_id="$1"
    if [[ -n "${2:-}" ]]; then
      payload="$(merge_payload_with_worker_runtime < "$2")"
    else
      payload="$(printf '{}' | merge_payload_with_worker_runtime)"
    fi
    "${worker_lifecycle_curl[@]}" "${worker_auth_header[@]}" \
      --data "${payload}" \
      "${BASE_URL}/api/founderos/orchestrate/jobs/${job_id}/fail"
    ;;
  *)
    echo "unknown command: ${cmd}" >&2
    exit 1
    ;;
esac
