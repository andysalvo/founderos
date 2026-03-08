#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/root/.config/founderos/aps.env"
SMOKE_REPO="${FOUNDEROS_SMOKE_REPO:-}"
SMOKE_BRANCH="${FOUNDEROS_SMOKE_BRANCH:-main}"
SMOKE_OBJECTIVE="${FOUNDEROS_SMOKE_OBJECTIVE:-Inspect the repo and return the current bounded worker proposal contract.}"
TIMEOUT_SECONDS="${FOUNDEROS_SMOKE_TIMEOUT_SECONDS:-90}"
POLL_SECONDS="${FOUNDEROS_SMOKE_POLL_SECONDS:-5}"
RUN_SMOKE=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --repo)
      SMOKE_REPO="$2"
      shift 2
      ;;
    --branch)
      SMOKE_BRANCH="$2"
      shift 2
      ;;
    --objective)
      SMOKE_OBJECTIVE="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --poll-seconds)
      POLL_SECONDS="$2"
      shift 2
      ;;
    --no-smoke)
      RUN_SMOKE=0
      shift
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLIENT="${ROOT_DIR}/services/openclaw/aps-client.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "env file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

required_vars=(
  FOUNDEROS_BASE_URL
  FOUNDEROS_WORKER_KEY
)

missing=0
for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "missing required env var: ${var_name}" >&2
    missing=1
  fi
done

if [[ -z "${FOUNDEROS_PUBLIC_WRITE_KEY:-${FOUNDEROS_WRITE_KEY:-}}" ]]; then
  echo "missing required env var: FOUNDEROS_PUBLIC_WRITE_KEY or FOUNDEROS_WRITE_KEY" >&2
  missing=1
fi

if [[ "${missing}" -ne 0 ]]; then
  exit 1
fi

LOCAL_BRANCH="$(git -C "${ROOT_DIR}" rev-parse --abbrev-ref HEAD 2>/dev/null || printf 'unknown')"
LOCAL_COMMIT_SHA="$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || printf '')"
LOCAL_COMMIT_SOURCE="git"

print_section() {
  echo
  echo "== $1 =="
}

print_section "Founderos worker env"
echo "BASE_URL=${FOUNDEROS_BASE_URL}"
echo "WORKER_ID=${FOUNDEROS_WORKER_ID:-openclaw-worker}"
echo "LOCAL_BRANCH=${LOCAL_BRANCH}"
echo "LOCAL_COMMIT_SHA=${LOCAL_COMMIT_SHA:-unknown}"

echo
print_section "Public APS capabilities"
bash "${CLIENT}" capabilities >"${TMP_DIR}/capabilities.json"
node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!payload.ok) process.exit(1);
process.stdout.write(`ok=${payload.ok} endpoints=${Array.isArray(payload.endpoints) ? payload.endpoints.length : 0}\n`);
' "${TMP_DIR}/capabilities.json"

if [[ "${RUN_SMOKE}" -eq 0 ]]; then
  echo
  echo "basic worker check completed"
  exit 0
fi

if [[ -z "${SMOKE_REPO}" ]]; then
  echo "smoke verification requires --repo or FOUNDEROS_SMOKE_REPO" >&2
  exit 1
fi

print_section "Async worker smoke job"
submit_output="$(bash "${CLIENT}" submit "${SMOKE_OBJECTIVE}" "${SMOKE_REPO}" "${SMOKE_BRANCH}" "worker-check")"
printf '%s\n' "${submit_output}" >"${TMP_DIR}/submit.json"
JOB_ID="$(node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const jobId = payload.job?.job_id || payload.job_id || payload.job?.id || null;
if (!jobId) process.exit(1);
process.stdout.write(jobId);
' "${TMP_DIR}/submit.json")"
echo "job_id=${JOB_ID}"

deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))
while true; do
  bash "${CLIENT}" job-status "${JOB_ID}" >"${TMP_DIR}/job-status.json"
  JOB_STATUS="$(node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.stdout.write(payload.job?.status || "unknown");
' "${TMP_DIR}/job-status.json")"

  echo "status=${JOB_STATUS}"

  if [[ "${JOB_STATUS}" == "completed" || "${JOB_STATUS}" == "failed" || "${JOB_STATUS}" == "blocked" ]]; then
    break
  fi

  if [[ $(date +%s) -ge ${deadline} ]]; then
    echo "timed out waiting for job ${JOB_ID}" >&2
    exit 1
  fi

  sleep "${POLL_SECONDS}"
done

if [[ "${JOB_STATUS}" != "completed" ]]; then
  echo "worker smoke job did not complete successfully: ${JOB_STATUS}" >&2
  exit 1
fi

print_section "Worker runtime reconciliation"
node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const localCommit = process.argv[2] || "";
const job = payload.job || {};
const result = job.result_json || {};
const nested = result.result || {};
const workerRuntime = job.worker_runtime || result.worker_runtime || nested.worker_runtime || {};
const structured = nested.structured_output || result.structured_output || null;
const proposal = nested.proposal || result.proposal || null;
const candidate = proposal?.candidate_write_set || result.suggested_next_improvement?.candidate_write_set || nested.suggested_next_improvement?.candidate_write_set || null;
const workerCommit = workerRuntime.worker_commit_sha || "";
const drift = Boolean(localCommit) && Boolean(workerCommit) && localCommit !== workerCommit;
const summary = {
  worker_id: workerRuntime.worker_id || "unknown",
  worker_version: workerRuntime.worker_version || "unknown",
  worker_commit_sha: workerCommit || "unknown",
  local_commit_sha: localCommit || "unknown",
  commit_match: Boolean(localCommit) && Boolean(workerCommit) ? localCommit === workerCommit : null,
  structured_output_present: Boolean(structured),
  proposal_present: Boolean(proposal),
  candidate_write_set_present: Boolean(candidate),
  proposal_status: proposal?.status || "unknown",
  proposal_title: proposal?.title || "",
};
process.stdout.write(JSON.stringify(summary, null, 2));
if (drift || !structured || !proposal || !candidate) {
  process.exit(2);
}
' "${TMP_DIR}/job-status.json" "${LOCAL_COMMIT_SHA}" >"${TMP_DIR}/verification-summary.json" || verification_failed=1
cat "${TMP_DIR}/verification-summary.json"

if [[ "${verification_failed:-0}" -ne 0 ]]; then
  echo
  echo "worker contract verification failed" >&2
  exit 1
fi

echo
echo "worker contract verified"
