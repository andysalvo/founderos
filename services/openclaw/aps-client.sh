#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${FOUNDEROS_BASE_URL:-}"
WRITE_KEY="${FOUNDEROS_WRITE_KEY:-}"
WORKER_KEY="${FOUNDEROS_WORKER_KEY:-}"
WORKER_ID="${FOUNDEROS_WORKER_ID:-openclaw-worker}"

if [[ -z "${BASE_URL}" ]]; then
  echo "FOUNDEROS_BASE_URL is required" >&2
  exit 1
fi

if [[ -z "${WRITE_KEY}" ]]; then
  echo "FOUNDEROS_WRITE_KEY is required" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <capabilities|plan|repo-file|repo-tree|execute|submit|job-status|claim|heartbeat|complete|fail> [args...]" >&2
  exit 1
fi

cmd="$1"
shift || true

auth_header=(-H "x-founderos-key: ${WRITE_KEY}" -H "content-type: application/json")
worker_auth_header=(-H "x-founderos-worker-key: ${WORKER_KEY}" -H "x-founderos-worker-id: ${WORKER_ID}" -H "content-type: application/json")

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
  submit)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 submit \"user request\" [repo] [branch] [requested_by]" >&2
      exit 1
    fi
    request="$1"
    repo="${2:-}"
    branch="${3:-main}"
    requested_by="${4:-openclaw}"
    request_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${request}")"
    repo_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${repo}")"
    branch_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${branch}")"
    requested_by_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${requested_by}")"
    curl -sS "${auth_header[@]}" \
      -d "{\"user_request\":${request_json},\"scope\":{\"repo\":${repo_json},\"branch\":${branch_json}},\"requested_by\":${requested_by_json}}" \
      "${BASE_URL}/api/founderos/orchestrate/submit"
    ;;
  job-status)
    if [[ $# -lt 1 ]]; then
      echo "usage: $0 job-status <job_id>" >&2
      exit 1
    fi
    job_id="$1"
    curl -sS -H "x-founderos-key: ${WRITE_KEY}" \
      "${BASE_URL}/api/founderos/orchestrate/jobs/${job_id}"
    ;;
  claim)
    if [[ -z "${WORKER_KEY}" ]]; then
      echo "FOUNDEROS_WORKER_KEY is required" >&2
      exit 1
    fi
    curl -sS "${worker_auth_header[@]}" \
      -d '{}' \
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
    status="${2:-claimed}"
    message="${3:-}"
    progress="${4:-null}"
    status_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${status}")"
    message_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "${message}")"
    curl -sS "${worker_auth_header[@]}" \
      -d "{\"status\":${status_json},\"message\":${message_json},\"progress\":${progress}}" \
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
    result_file="${2:-}"
    if [[ -n "${result_file}" ]]; then
      payload="$(cat "${result_file}")"
    else
      payload='{}'
    fi
    curl -sS "${worker_auth_header[@]}" \
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
    result_file="${2:-}"
    if [[ -n "${result_file}" ]]; then
      payload="$(cat "${result_file}")"
    else
      payload='{}'
    fi
    curl -sS "${worker_auth_header[@]}" \
      --data "${payload}" \
      "${BASE_URL}/api/founderos/orchestrate/jobs/${job_id}/fail"
    ;;
  *)
    echo "unknown command: ${cmd}" >&2
    exit 1
    ;;
esac
