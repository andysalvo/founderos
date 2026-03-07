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
const activationDocNeedsWorkerUpdate =
  !activationText.includes("FOUNDEROS_WORKER_KEY") ||
  !activationText.includes("claim") ||
  !activationText.includes("heartbeat");
const desiredActivationDoc = [
  "# OpenClaw APS Activation",
  "",
  "This is the live persistent setup for the current Founderos async worker path:",
  "",
  "- OpenClaw stays on the droplet as the private worker habitat.",
  "- ChatGPT remains the public conversational interface.",
  "- APS stays on Vercel as the public control plane and authority boundary.",
  "- OpenClaw uses `FOUNDEROS_WRITE_KEY` for public APS reads and submits when needed.",
  "- OpenClaw uses `FOUNDEROS_WORKER_KEY` for worker-only orchestration claim, heartbeat, complete, and fail calls.",
  "",
  "Do not give OpenClaw the GitHub App private key or Supabase service-role key directly.",
  "",
  "## What this gives you",
  "",
  "1. ChatGPT can submit async jobs through public APS.",
  "2. OpenClaw can claim those jobs privately from the VM.",
  "3. APS keeps auth, policy, witness logging, and GitHub write boundaries server-side.",
  "4. The worker loop can keep running even when the laptop terminal is closed.",
  "",
  "## VM env vars",
  "",
  "OpenClaw on the droplet should have:",
  "",
  "- `FOUNDEROS_BASE_URL`",
  "- `FOUNDEROS_WRITE_KEY`",
  "- `FOUNDEROS_WORKER_KEY`",
  "- `FOUNDEROS_WORKER_ID`",
  "",
  "Recommended values:",
  "",
  "- `FOUNDEROS_BASE_URL=https://founderos-alpha.vercel.app`",
  "- `FOUNDEROS_WRITE_KEY=<same value configured in Vercel for GPT/user APS auth>`",
  "- `FOUNDEROS_WORKER_KEY=<worker-only key configured in Vercel>`",
  "- `FOUNDEROS_WORKER_ID=openclaw-vm`",
  "",
  "## Droplet setup",
  "",
  "Create a small env file on the droplet:",
  "",
  "```bash",
  "mkdir -p /root/.config/founderos",
  "cat >/root/.config/founderos/aps.env <<'EOF'",
  "FOUNDEROS_BASE_URL=https://founderos-alpha.vercel.app",
  "FOUNDEROS_WRITE_KEY=REPLACE_ME",
  "FOUNDEROS_WORKER_KEY=REPLACE_ME",
  "FOUNDEROS_WORKER_ID=openclaw-vm",
  "EOF",
  "chmod 600 /root/.config/founderos/aps.env",
  "```",
  "",
  "## Helper script",
  "",
  "This repo includes a helper at:",
  "",
  "- [`services/openclaw/aps-client.sh`](/Users/andysalvo_1/Documents/GitHub/founderos/services/openclaw/aps-client.sh)",
  "",
  "It supports:",
  "",
  "- `capabilities`",
  "- `plan`",
  "- `repo-file`",
  "- `repo-tree`",
  "- `submit`",
  "- `job-status`",
  "- `claim`",
  "- `heartbeat`",
  "- `complete`",
  "- `fail`",
  "",
  "## Worker loop startup",
  "",
  "From the droplet clone of this repo:",
  "",
  "```bash",
  "cd /root/.openclaw/workspace/founderos",
  "set -a",
  "source /root/.config/founderos/aps.env",
  "set +a",
  "nohup bash services/openclaw/worker-loop.sh >/root/founderos-worker.log 2>&1 &",
  "```",
  "",
  "## Verification",
  "",
  "Public APS auth check:",
  "",
  "```bash",
  "bash services/openclaw/aps-client.sh capabilities",
  "```",
  "",
  "Worker claim check:",
  "",
  "```bash",
  "bash services/openclaw/aps-client.sh claim",
  "```",
  "",
  "Async job verification:",
  "",
  "1. Submit a job through `orchestrate/submit`.",
  "2. Wait for the worker loop to claim it.",
  "3. Poll `orchestrate/jobs/{job_id}` for durable status and result.",
  "",
  "## How execution stays safe",
  "",
  "- APS checks the repo allowlist.",
  "- APS rejects protected paths.",
  "- Durable writes still require governed APS execution.",
  "- Autonomous changes should end in reviewable PRs rather than direct pushes to `main`.",
  "",
  "## Daily operating model",
  "",
  "Use Founderos like this:",
  "",
  "1. Submit a bounded async job from ChatGPT through public APS.",
  "2. Let OpenClaw claim and inspect privately on the VM.",
  "3. Review the returned proposal or write set.",
  "4. Approve the resulting PR through GitHub when the change is acceptable.",
  "",
  "That is the current safe path from chat intent to bounded self-improvement.",
].join(\"\\n\");

const improvementProposal = activationDocNeedsWorkerUpdate
  ? {
      kind: "docs_alignment",
      title: "Update OpenClaw activation docs for the live async worker loop",
      priority: "high",
      rationale:
        "The current activation doc still describes the older one-key flow and does not document the live worker-authenticated async orchestration path.",
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
      candidate_write_set: {
        mode: "exact_write_set_candidate",
        repo,
        branch_name: "codex/update-worker-activation-docs",
        base_branch: "main",
        title: "Document async worker activation for Founderos",
        rationale:
          "The live system now uses separate public and worker auth lanes, so the activation docs should reflect the actual operating model.",
        files: [
          {
            path: "docs/OPENCLAW_APS_ACTIVATION.md",
            action: "update",
            content: desiredActivationDoc,
            intent: "Describe the two-key APS + worker activation path and verification loop.",
          },
        ],
      },
    }
  : {
      kind: "safe_improvement_proposal",
      title: "Upgrade the worker from inspect-and-report to inspect-and-propose",
      priority: "high",
      rationale:
        "The system can inspect and report on itself, but it still lacks autonomous write-set generation for PR-based self-improvement.",
      risk_level: "low",
      target_area: "services/openclaw, result shaping, and operator-facing docs",
      target_files: [
        "services/openclaw/worker-loop.sh",
        "services/openclaw/aps-client.sh",
        "docs/FOUNDEROS_LIVE_STATE.md",
        "README.md",
      ],
      proposed_changes: [
        "Generate a concrete safe improvement proposal from worker inspection output.",
        "Return rationale, target files, acceptance criteria, and a candidate write-set scaffold in the job result.",
        "Keep the live-state and README docs aligned with the improved worker behavior.",
      ],
      acceptance_criteria: [
        "Completed jobs include a bounded improvement proposal with explicit target files.",
        "Proposal output remains within the existing PR-only guarded execution model.",
        "Documentation reflects the richer autonomous worker behavior without overstating capabilities.",
      ],
      expected_outcome:
        "Return a concrete safe improvement proposal that can later be translated into a PR-ready exact write set.",
      candidate_write_set: {
        mode: "proposal_only",
        repo,
        branch_name: "codex/safe-improvement-proposal",
        base_branch: "main",
        title: "Improve autonomous proposal generation for Founderos worker",
        rationale:
          "The worker can inspect and describe the system, but it should next emit one bounded improvement proposal with enough structure to translate into a PR-ready write set.",
        files: [
          {
            path: "services/openclaw/worker-loop.sh",
            action: "update",
            intent: "Generate a concrete safe improvement proposal from inspection results.",
          },
          {
            path: "services/openclaw/aps-client.sh",
            action: "update",
            intent: "Support any additional worker-side orchestration calls needed by proposal generation.",
          },
          {
            path: "docs/FOUNDEROS_LIVE_STATE.md",
            action: "update",
            intent: "Keep the live-state document aligned with the richer autonomous behavior.",
          },
          {
            path: "README.md",
            action: "update",
            intent: "Keep top-level system documentation aligned with the new worker capability.",
          },
        ],
      },
    };
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
  summary: "Initial worker self-state inspection completed.",
  result: {
    repo,
    file_count: files.length,
    top_paths: topPaths,
    recommended_next_action:
      "Review the bounded safe improvement proposal and promote it into a PR-ready exact write set.",
    readme_excerpt: readmeLines,
    activation_doc_excerpt: activationLines,
    self_state: selfState,
    suggested_next_improvement: improvementProposal,
  },
};

fs.writeFileSync(targetPath, JSON.stringify(result));
' "${tmp_file}"
}

inspect_job() {
  local claimed_json="$1"
  local job_id repo branch tree_json readme_json activation_doc_json payload_file

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

  if activation_doc_json="$("${CLIENT}" repo-file "${repo}" "docs/OPENCLAW_APS_ACTIVATION.md" "${branch}" 2>/dev/null)"; then
    :
  else
    activation_doc_json='{"ok":false,"content":null}'
  fi

  payload_file="$(mktemp)"
  FOUNDEROS_TREE_JSON="${tree_json}" \
  FOUNDEROS_README_JSON="${readme_json}" \
  FOUNDEROS_ACTIVATION_DOC_JSON="${activation_doc_json}" \
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
