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
const claim = JSON.parse(process.env.JOB_JSON || "{}");
const job = claim.job || {};
const tree = JSON.parse(process.env.FOUNDEROS_TREE_JSON || "{}");
const readme = JSON.parse(process.env.FOUNDEROS_README_JSON || "{}");
const activationDoc = JSON.parse(process.env.FOUNDEROS_ACTIVATION_DOC_JSON || "{}");
const decisionsIndex = JSON.parse(process.env.FOUNDEROS_DECISIONS_INDEX_JSON || "{}");
const decisionDocs = JSON.parse(process.env.FOUNDEROS_DECISION_DOCS_JSON || "[]");

const files = Array.isArray(tree.files) ? tree.files : [];
const topPaths = files.slice(0, 20).map((file) => file.path);
const readmeText = typeof readme.content === "string" ? readme.content : "";
const readmeLines = readmeText.split(/\r?\n/).slice(0, 12);
const activationText = typeof activationDoc.content === "string" ? activationDoc.content : "";
const activationLines = activationText.split(/\r?\n/).slice(0, 18);
const activeSurface = files
  .filter((file) => /^api\/founderos\//.test(file.path))
  .map((file) => file.path)
  .sort();
const repo = job.repo || (job.scope_json && job.scope_json.repo) || null;

function readDecisionField(markdown, label) {
  const match = markdown.match(new RegExp(`^- \\*\\*${label}:\\*\\*\\s*(.+)$`, "mi"));
  return match ? match[1].trim() : null;
}

function summarizeParagraph(markdown, heading) {
  const pattern = new RegExp(`^## ${heading}\\n([\\s\\S]*?)(\\n## |$)`, "m");
  const match = markdown.match(pattern);
  if (!match) {
    return null;
  }
  return match[1]
    .trim()
    .split(/\r?\n\r?\n/)[0]
    .replace(/\r?\n/g, " ")
    .trim();
}

function buildDecisionContext(indexJson, docs) {
  const ledgerFiles = Array.isArray(indexJson.files) ? indexJson.files : [];
  const decisions = Array.isArray(docs) ? docs : [];
  const parsed = decisions
    .filter((item) => item && typeof item.path === "string" && typeof item.content === "string")
    .map((item) => {
      const status = readDecisionField(item.content, "Status");
      const decisionId = readDecisionField(item.content, "Decision ID");
      const date = readDecisionField(item.content, "Date");
      const domain = readDecisionField(item.content, "Domain");
      const summary = readDecisionField(item.content, "Summary");
      return {
        path: item.path,
        decision_id: decisionId,
        status,
        date,
        domain,
        summary,
        rationale: summarizeParagraph(item.content, "Rationale"),
        decision: summarizeParagraph(item.content, "Decision"),
      };
    });

  const activeDecisions = parsed.filter((item) => item.status === "active");
  return {
    ledger_path: "memory/decisions",
    ledger_file_count: ledgerFiles.length,
    active_decision_count: activeDecisions.length,
    active_decisions: activeDecisions,
    active_decision_ids: activeDecisions.map((item) => item.decision_id).filter(Boolean),
    active_summaries: activeDecisions.map((item) => item.summary).filter(Boolean),
  };
}

function hasLiveWorkerAuthMarkers(text) {
  return (
    typeof text === "string" &&
    text.includes("FOUNDEROS_WORKER_KEY") &&
    text.includes("claim") &&
    text.includes("heartbeat")
  );
}

function buildImprovementProposal({ repo, activationText, decisionContext }) {
  const activeDecisionIds = Array.isArray(decisionContext.active_decision_ids)
    ? decisionContext.active_decision_ids
    : [];
  const hasUnifiedReasoningDecision = activeDecisionIds.includes("DEC-0001");

  if (!hasLiveWorkerAuthMarkers(activationText)) {
    return {
      kind: "docs_alignment",
      title: "Update OpenClaw activation docs for the live async worker loop",
      priority: "high",
      rationale:
        "The current activation doc still describes an older flow and does not document the live worker-authenticated async orchestration path clearly enough.",
      risk_level: "low",
      target_area: "operator-facing activation and recovery documentation",
      target_files: [
        "docs/OPENCLAW_APS_ACTIVATION.md",
        "docs/FOUNDEROS_LIVE_STATE.md",
        "README.md",
      ],
      proposed_changes: [
        "Document FOUNDEROS_WORKER_KEY alongside FOUNDEROS_WRITE_KEY in the VM activation path.",
        "Add the worker claim, heartbeat, complete, and fail loop to the activation and verification docs.",
        "Align top-level docs with the fact that the live system now has a public async lane and a private worker lane.",
      ],
      acceptance_criteria: [
        "Activation docs describe both public APS auth and worker-only auth correctly.",
        "Operator can follow the documented steps to restart the worker loop and verify one async job.",
        "Top-level docs remain consistent with the actual live runtime and boundaries.",
      ],
      expected_outcome:
        "The repo documents the live async worker path accurately, reducing recovery risk and making the system easier for the agent to reason about.",
    };
  }

  if (hasUnifiedReasoningDecision) {
    return {
      kind: "decision_context_follow_through",
      title: "Carry active decision context into broader worker inspection inputs",
      priority: "high",
      rationale:
        "The active unified-reasoning decision says Founderos should operate as one continuous system identity, so worker recommendations should keep incorporating shared state objects instead of reasoning from isolated docs alone.",
      risk_level: "low",
      target_area: "worker inspection scope and structured recommendation context",
      target_files: [
        "services/openclaw/worker-loop.sh",
        "docs/FIRST_STATE_OF_THE_UNION.md",
        "docs/DECISION_LEDGER.md",
      ],
      proposed_changes: [
        "Inspect the state-of-the-union snapshot alongside the decision ledger during worker runs.",
        "Expose a compact shared-context section in the worker result so later bounded improvements can key off both system state and active decisions.",
        "Keep recommendation logic grounded in active decisions rather than repeating stale local suggestions.",
      ],
      acceptance_criteria: [
        "Worker results include active decision context and a small shared-context summary.",
        "The next recommendation references active system decisions when they exist.",
        "The patch stays inside the current bounded worker and docs surface.",
      ],
      expected_outcome:
        "The worker keeps building on durable shared reasoning context instead of treating each inspection run as a mostly stateless snapshot.",
    };
  }

  return {
    kind: "safe_improvement_proposal",
    title: "Expand shared reasoning context beyond the repo entry docs",
    priority: "medium",
    rationale:
      "When no active bootstrap decision is detected, the next safe improvement is to widen worker inspection inputs just enough to improve recommendation quality without touching protected APS paths.",
    risk_level: "low",
    target_area: "worker inspection scope",
    target_files: [
      "services/openclaw/worker-loop.sh",
      "docs/FOUNDEROS_SYSTEM_SPEC.md",
    ],
    proposed_changes: [
      "Add one more bounded shared-state input to worker inspections.",
      "Surface that context in the structured result.",
      "Use the added context to improve the next bounded recommendation.",
    ],
    acceptance_criteria: [
      "Worker recommendations cite the additional shared context they used.",
      "The patch remains bounded and reviewable.",
    ],
    expected_outcome:
      "Worker output becomes less stateless and more grounded in durable repo context.",
  };
}

const decisionContext = buildDecisionContext(decisionsIndex, decisionDocs);
const improvementProposal = buildImprovementProposal({
  repo,
  activationText,
  decisionContext,
});
const selfState = {
  identity: {
    name: "Founderos",
    repo,
    interface_plane: "ChatGPT Custom GPT",
    execution_plane: "APS + OpenClaw",
    state_plane: "Supabase",
    code_plane: "GitHub",
  },
  live_runtime: {
    aps_base_url: process.env.FOUNDEROS_BASE_URL || null,
    worker_id: process.env.FOUNDEROS_WORKER_ID || "openclaw-worker",
    job_status: "completed",
  },
  capabilities: {
    active_surface: activeSurface,
    worker_loop_mode: "inspect_and_report",
    protected_write_boundary: "PR-only governed execution through APS",
  },
  current_limitations: [
    "Worker returns structured inspection results but does not yet generate exact write sets.",
    "Autonomous PR creation is not yet wired through the async worker lane.",
    "Durable memory kernel beyond orchestration history is still planned work.",
  ],
};

const result = {
  summary: "Worker inspection completed with bootstrap decision context.",
  result: {
    repo,
    file_count: files.length,
    top_paths: topPaths,
    recommended_next_action:
      "Review the bounded next-improvement proposal and keep it aligned with the active decision ledger.",
    readme_excerpt: readmeLines,
    activation_doc_excerpt: activationLines,
    decision_context: decisionContext,
    self_state: selfState,
    suggested_next_improvement: improvementProposal,
  },
};

fs.writeFileSync(targetPath, JSON.stringify(result));
' "${tmp_file}"
}

inspect_job() {
  local claimed_json="$1"
  local job_id repo branch tree_json readme_json activation_doc_json decisions_index_json payload_file decision_docs_json decision_paths

  job_id="$(printf '%s' "${claimed_json}" | json_field 'data.job.id')"
  repo="$(printf '%s' "${claimed_json}" | json_field 'data.job.repo || ""')"
  branch="$(printf '%s' "${claimed_json}" | json_field 'data.job.scope_json && data.job.scope_json.branch ? data.job.scope_json.branch : "main"')"

  if [[ -z "${job_id}" || -z "${repo}" ]]; then
    echo "Claimed job missing repo or id" >&2
    return
  fi

  post_status "${job_id}" "inspecting" "Reading repo tree for ${repo}" 0.15
  tree_json="$("${CLIENT}" repo-tree "${repo}" "${branch}" "" 200)"

  post_status "${job_id}" "planning" "Reading README and activation docs for ${repo}" 0.45
  if readme_json="$("${CLIENT}" repo-file "${repo}" "README.md" "${branch}" 2>/dev/null)"; then
    :
  else
    readme_json='{"ok":false,"content":null}'
  fi

  if activation_doc_json="$("${CLIENT}" repo-file "${repo}" "docs/OPENCLAW_APS_ACTIVATION.md" "${branch}" 2>/dev/null)"; then
    :
  else
    activation_doc_json='{"ok":false,"content":null}'
  fi

  post_status "${job_id}" "planning" "Reading bootstrap decision ledger for ${repo}" 0.7
  if decisions_index_json="$("${CLIENT}" repo-tree "${repo}" "${branch}" "memory/decisions" 50 2>/dev/null)"; then
    :
  else
    decisions_index_json='{"ok":false,"files":[]}'
  fi

  decision_paths="$(printf '%s' "${decisions_index_json}" | node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
const data = input ? JSON.parse(input) : {};
const files = Array.isArray(data.files) ? data.files : [];
const paths = files
  .map((item) => item && item.path)
  .filter((path) => typeof path === "string" && /^memory\/decisions\/.+\.md$/.test(path) && path !== "memory/decisions/README.md");
process.stdout.write(paths.join("\n"));
' 2>/dev/null || true)"

  decision_docs_json="[]"
  if [[ -n "${decision_paths}" ]]; then
    decision_docs_json="$(
      REPO="${repo}" BRANCH="${branch}" DECISION_PATHS="${decision_paths}" CLIENT_PATH="${CLIENT}" node -e '
const { execFileSync } = require("child_process");
const repo = process.env.REPO;
const branch = process.env.BRANCH;
const client = process.env.CLIENT_PATH;
const paths = (process.env.DECISION_PATHS || "").split(/\n/).filter(Boolean);
const docs = [];
for (const path of paths) {
  try {
    const raw = execFileSync(client, ["repo-file", repo, path, branch], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const parsed = JSON.parse(raw);
    docs.push({ path, content: typeof parsed.content === "string" ? parsed.content : "" });
  } catch (_err) {
    docs.push({ path, content: "" });
  }
}
process.stdout.write(JSON.stringify(docs));
' 2>/dev/null
    )"
  fi

  payload_file="$(mktemp)"
  FOUNDEROS_TREE_JSON="${tree_json}" \
  FOUNDEROS_README_JSON="${readme_json}" \
  FOUNDEROS_ACTIVATION_DOC_JSON="${activation_doc_json}" \
  FOUNDEROS_DECISIONS_INDEX_JSON="${decisions_index_json}" \
  FOUNDEROS_DECISION_DOCS_JSON="${decision_docs_json}" \
  build_result_payload "${claimed_json}" "${payload_file}"

  post_status "${job_id}" "write_set_ready" "Inspection summary prepared with decision context" 0.9
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
