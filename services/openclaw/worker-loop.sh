#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${FOUNDEROS_BASE_URL:-}"
WRITE_KEY="${FOUNDEROS_WRITE_KEY:-}"
WORKER_KEY="${FOUNDEROS_WORKER_KEY:-}"
WORKER_ID="${FOUNDEROS_WORKER_ID:-openclaw-worker}"
POLL_SECONDS="${FOUNDEROS_POLL_SECONDS:-10}"

if [[ -z "${BASE_URL}" || -z "${WRITE_KEY}" || -z "${WORKER_KEY}" ]]; then
  echo "FOUNDEROS_BASE_URL, FOUNDEROS_WRITE_KEY, and FOUNDEROS_WORKER_KEY are required" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLIENT="${ROOT_DIR}/services/openclaw/aps-client.sh"

json_field() {
  local expr="$1"
  node -e "
const fs = require('fs');
const input = fs.readFileSync(0, 'utf8');
const data = input ? JSON.parse(input) : {};
const value = (${expr});
if (value === undefined || value === null) process.exit(1);
if (typeof value === 'string') process.stdout.write(value);
else process.stdout.write(JSON.stringify(value));
" 2>/dev/null
}

post_status() {
  local job_id="$1"
  local status="$2"
  local message="$3"
  local progress="${4:-null}"
  "${CLIENT}" heartbeat "${job_id}" "${status}" "${message}" "${progress}" >/dev/null
}

complete_job() {
  local job_id="$1"
  local payload_file="$2"
  "${CLIENT}" complete "${job_id}" "${payload_file}" >/dev/null
}

fail_job() {
  local job_id="$1"
  local payload_file="$2"
  "${CLIENT}" fail "${job_id}" "${payload_file}" >/dev/null
}

build_result_payload() {
  local job_json="$1"
  local tmp_file="$2"

  JOB_JSON="${job_json}" node -e '
const fs = require("fs");
const targetPath = process.argv[1];
const job = JSON.parse(process.env.JOB_JSON || "{}");
const tree = JSON.parse(process.env.FOUNDEROS_TREE_JSON || "{}");
const readme = JSON.parse(process.env.FOUNDEROS_README_JSON || "{}");

const files = Array.isArray(tree.files) ? tree.files : [];
const topPaths = files.slice(0, 20).map((file) => file.path);
const readmeText = typeof readme.content === "string" ? readme.content : "";
const readmeLines = readmeText.split(/\r?\n/).slice(0, 12);

const result = {
  summary: "Initial worker inspection completed.",
  result: {
    repo: job.repo || (job.scope_json && job.scope_json.repo) || null,
    file_count: files.length,
    top_paths: topPaths,
    recommended_next_action:
      "Review the repo snapshot and create a bounded write_set for one safe improvement PR.",
    readme_excerpt: readmeLines,
  },
};

fs.writeFileSync(targetPath, JSON.stringify(result));
' "${tmp_file}"
}

inspect_job() {
  local claimed_json="$1"
  local job_id repo branch tree_json readme_json payload_file

  job_id="$(printf '%s' "${claimed_json}" | json_field 'data.job.id')"
  repo="$(printf '%s' "${claimed_json}" | json_field 'data.job.repo || ""')"
  branch="$(printf '%s' "${claimed_json}" | json_field 'data.job.scope_json && data.job.scope_json.branch ? data.job.scope_json.branch : "main"')"

  if [[ -z "${job_id}" || -z "${repo}" ]]; then
    echo "Claimed job missing repo or id" >&2
    return
  fi

  post_status "${job_id}" "inspecting" "Reading repo tree for ${repo}" 0.2
  tree_json="$("${CLIENT}" repo-tree "${repo}" "${branch}" "" 200)"

  post_status "${job_id}" "planning" "Reading README for ${repo}" 0.6
  if readme_json="$("${CLIENT}" repo-file "${repo}" "README.md" "${branch}" 2>/dev/null)"; then
    :
  else
    readme_json='{"ok":false,"content":null}'
  fi

  payload_file="$(mktemp)"
  FOUNDEROS_TREE_JSON="${tree_json}" \
  FOUNDEROS_README_JSON="${readme_json}" \
  build_result_payload "${claimed_json}" "${payload_file}"

  post_status "${job_id}" "write_set_ready" "Inspection summary prepared" 0.9
  if [[ ! -s "${payload_file}" ]]; then
    echo "Worker payload generation failed for ${job_id}" >&2
    fail_job "${job_id}" "${payload_file}"
    rm -f "${payload_file}"
    return 1
  fi
  complete_job "${job_id}" "${payload_file}"
  rm -f "${payload_file}"
}

echo "Founderos worker loop starting against ${BASE_URL} as ${WORKER_ID}"

while true; do
  claim_json="$("${CLIENT}" claim)"
  claimed_id="$(printf '%s' "${claim_json}" | json_field 'data.job && data.job.id ? data.job.id : null' || true)"

  if [[ -z "${claimed_id}" ]]; then
    sleep "${POLL_SECONDS}"
    continue
  fi

  if ! inspect_job "${claim_json}"; then
    echo "Worker loop failed while processing ${claimed_id}" >&2
    payload_file="$(mktemp)"
    printf '{"error":"worker_loop_failed","result":{"recommended_action":"inspect worker logs"}}' >"${payload_file}"
    fail_job "${claimed_id}" "${payload_file}" || true
    rm -f "${payload_file}"
  fi

  sleep 1
done
