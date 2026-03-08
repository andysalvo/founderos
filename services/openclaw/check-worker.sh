#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/root/.config/founderos/aps.env"
SMOKE_REPO="${FOUNDEROS_SMOKE_REPO:-}"
SMOKE_BRANCH="${FOUNDEROS_SMOKE_BRANCH:-main}"
SMOKE_OBJECTIVE="${FOUNDEROS_SMOKE_OBJECTIVE:-Inspect the repo and return the current APS-centered trading research contract for paper-trading-loop.}"
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
const endpoints = Array.isArray(payload.endpoints) ? payload.endpoints.map((item) => item.path) : [];
const required = [
  "/api/founderos/trading/candidates",
  "/api/founderos/trading/journal",
  "/api/founderos/trading/backtests/{run_id}",
  "/api/founderos/trading/connectors/health",
];
for (const path of required) {
  if (!endpoints.includes(path)) {
    process.exit(2);
  }
}
process.stdout.write(`ok=${payload.ok} endpoints=${endpoints.length} trading_surface=present\n`);
' "${TMP_DIR}/capabilities.json"

echo
print_section "APS trading connectors health"
bash "${CLIENT}" trading-connectors-health >"${TMP_DIR}/connectors-health.json"
node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!payload.ok) process.exit(1);
const connectors = Array.isArray(payload.connectors) ? payload.connectors : [];
const paperBroker = connectors.find(
  (item) => item.provider === "alpaca" && item.role === "broker" && item.mode === "paper"
);
if (!paperBroker) {
  process.exit(2);
}
process.stdout.write(
  JSON.stringify(
    {
      connectors: connectors.length,
      paper_broker_status: paperBroker.status,
      live_authority_stage:
        payload.live_authority_state && payload.live_authority_state.stage
          ? payload.live_authority_state.stage
          : "unknown",
    },
    null,
    2
  )
);
' "${TMP_DIR}/connectors-health.json"

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
SMOKE_OBJECTIVE="$SMOKE_OBJECTIVE" SMOKE_REPO="$SMOKE_REPO" SMOKE_BRANCH="$SMOKE_BRANCH" node -e '
const fs = require("fs");
const payload = {
  user_request: process.env.SMOKE_OBJECTIVE || "",
  requested_by: "worker-check",
  requested_by_lane: "worker_bootstrap",
  requested_by_subject_type: "worker",
  scope: {
    repo: process.env.SMOKE_REPO || "",
    branch: process.env.SMOKE_BRANCH || "main",
    project_slug: "paper-trading-loop",
    task_kind: "trading_research",
    anchor_paths: [
      "projects/paper-trading-loop/README.md",
      "projects/paper-trading-loop/alpaca-paper-mvp.md",
      "projects/paper-trading-loop/paper-first-architecture.md",
      "projects/paper-trading-loop/risk-rules.md",
      "projects/paper-trading-loop/journal-schema.md",
      "projects/paper-trading-loop/first-strategy.md",
      "projects/paper-trading-loop/research/trading-agent-research-notes.md",
      "projects/paper-trading-loop/trading-object-model.md",
      "docs/governance/CONSTITUTION.md",
    ],
    provider: "alpaca",
    execution_mode: "paper",
    strategy_name: "btc_usd_breakout_v1",
    asset: "BTC/USD",
    timeframe: "15m",
  },
};
fs.writeFileSync(process.argv[1], JSON.stringify(payload, null, 2));
' "${TMP_DIR}/submit-payload.json"
submit_output="$(bash "${CLIENT}" submit-json "${TMP_DIR}/submit-payload.json")"
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
const taskKind = nested.task_kind || result.task_kind || structured?.task_kind || "unknown";
const projectSlug = nested.project_slug || result.project_slug || structured?.project_slug || "unknown";
const anchorPathsLoaded = Array.isArray(nested.anchor_paths_loaded)
  ? nested.anchor_paths_loaded
  : Array.isArray(structured?.anchor_paths_loaded)
    ? structured.anchor_paths_loaded
    : [];
const workerCommit = workerRuntime.worker_commit_sha || "";
const drift = Boolean(localCommit) && Boolean(workerCommit) && localCommit !== workerCommit;
const summary = {
  worker_id: workerRuntime.worker_id || "unknown",
  worker_version: workerRuntime.worker_version || "unknown",
  worker_commit_sha: workerCommit || "unknown",
  local_commit_sha: localCommit || "unknown",
  commit_match: Boolean(localCommit) && Boolean(workerCommit) ? localCommit === workerCommit : null,
  project_slug: projectSlug,
  task_kind: taskKind,
  structured_output_present: Boolean(structured),
  proposal_present: Boolean(proposal),
  candidate_write_set_present: Boolean(candidate),
  anchor_paths_loaded: anchorPathsLoaded.length,
  proposal_status: proposal?.status || "unknown",
  proposal_title: proposal?.title || "",
};
process.stdout.write(JSON.stringify(summary, null, 2));
if (
  drift ||
  !structured ||
  !proposal ||
  !candidate ||
  projectSlug !== "paper-trading-loop" ||
  taskKind !== "trading_research" ||
  anchorPathsLoaded.length === 0
) {
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
