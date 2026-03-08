#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${FOUNDEROS_BASE_URL:-}"
WRITE_KEY="${FOUNDEROS_PUBLIC_WRITE_KEY:-${FOUNDEROS_WRITE_KEY:-}}"
WORKER_KEY="${FOUNDEROS_WORKER_KEY:-}"
WORKER_ID="${FOUNDEROS_WORKER_ID:-openclaw-worker}"
POLL_SECONDS="${FOUNDEROS_POLL_SECONDS:-10}"

if [[ -z "${BASE_URL}" || -z "${WRITE_KEY}" || -z "${WORKER_KEY}" ]]; then
  echo "FOUNDEROS_BASE_URL, FOUNDEROS_PUBLIC_WRITE_KEY or FOUNDEROS_WRITE_KEY, and FOUNDEROS_WORKER_KEY are required" >&2
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
const scope = job.scope_json && typeof job.scope_json === "object" ? job.scope_json : {};
const tree = JSON.parse(process.env.FOUNDEROS_TREE_JSON || "{}");
const readme = JSON.parse(process.env.FOUNDEROS_README_JSON || "{}");
const activationDoc = JSON.parse(process.env.FOUNDEROS_ACTIVATION_DOC_JSON || "{}");
const anchorDocs = JSON.parse(process.env.FOUNDEROS_ANCHOR_DOCS_JSON || "[]");

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
const repo = job.repo || scope.repo || null;
const objective =
  typeof job.user_request === "string"
    ? job.user_request.trim()
    : typeof claim.user_request === "string"
      ? claim.user_request.trim()
      : "";
const projectSlug = typeof scope.project_slug === "string" ? scope.project_slug.trim() : "";
const provider = typeof scope.provider === "string" ? scope.provider.trim() : "";
const executionMode = typeof scope.execution_mode === "string" ? scope.execution_mode.trim() : "";
const strategyName = typeof scope.strategy_name === "string" ? scope.strategy_name.trim() : "";
const asset = typeof scope.asset === "string" ? scope.asset.trim() : "";
const timeframe = typeof scope.timeframe === "string" ? scope.timeframe.trim() : "";

const desiredActivationDoc = [
  "# OpenClaw APS Activation",
  "",
  "This is the live persistent setup for the current Founderos async worker path:",
  "",
  "- OpenClaw stays on the droplet as the private worker habitat.",
  "- ChatGPT remains the public conversational interface.",
  "- APS stays on Vercel as the public control plane and authority boundary.",
  "- OpenClaw uses `FOUNDEROS_PUBLIC_WRITE_KEY` when available, or the transitional `FOUNDEROS_WRITE_KEY`, for public APS reads and submits when needed.",
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
  "- `FOUNDEROS_PUBLIC_WRITE_KEY` or `FOUNDEROS_WRITE_KEY`",
  "- `FOUNDEROS_WORKER_KEY`",
  "- `FOUNDEROS_WORKER_ID`",
  "",
  "Recommended values:",
  "",
  "- `FOUNDEROS_BASE_URL=https://founderos-alpha.vercel.app`",
  "- `FOUNDEROS_PUBLIC_WRITE_KEY=<preferred public/user APS key configured in Vercel>`",
  "- `FOUNDEROS_WRITE_KEY=<optional compatibility fallback during migration>`",
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
  "FOUNDEROS_PUBLIC_WRITE_KEY=REPLACE_ME",
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
  "- `freeze`",
  "- `execute`",
  "- `merge-pr`",
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
].join("\n");

function hasLiveWorkerAuthMarkers(text) {
  return (
    typeof text === "string" &&
    text.includes("FOUNDEROS_WORKER_KEY") &&
    text.includes("claim") &&
    text.includes("heartbeat")
  );
}

const WORKER_TASK_KINDS = new Set([
  "bootstrap_self_improvement",
  "trading_research",
  "trading_backtest",
  "trading_shadow_scan",
  "trading_paper_execute",
  "trading_live_stage",
  "trading_live_execute",
  "trading_sync",
]);

function inferLane(objectiveText, taskKind) {
  if (typeof taskKind === "string" && taskKind.startsWith("trading_")) {
    return "trading";
  }
  if (taskKind === "bootstrap_self_improvement") {
    return "bootstrap";
  }
  const text = typeof objectiveText === "string" ? objectiveText.toLowerCase() : "";
  if (text.includes("security") || text.includes("authority") || text.includes("hardening")) {
    return "security";
  }
  if (text.includes("reliability") || text.includes("recovery") || text.includes("systemd") || text.includes("operations")) {
    return "operations";
  }
  if (text.includes("workflow") || text.includes("business") || text.includes("project") || text.includes("task") || text.includes("document")) {
    return "workflow";
  }
  if (text.includes("research") || text.includes("ledger") || text.includes("stripe") || text.includes("payment")) {
    return "research";
  }
  return "general";
}

function normalizeTaskKind(rawTaskKind, objectiveText, activeProjectSlug) {
  if (typeof rawTaskKind === "string" && WORKER_TASK_KINDS.has(rawTaskKind.trim())) {
    return rawTaskKind.trim();
  }

  const text = typeof objectiveText === "string" ? objectiveText.toLowerCase() : "";
  const looksTrading =
    activeProjectSlug === "paper-trading-loop" ||
    text.includes("alpaca") ||
    text.includes("paper trading") ||
    text.includes("paper-trading") ||
    text.includes("crypto") ||
    text.includes("trading") ||
    text.includes("backtest") ||
    text.includes("strategy");

  return looksTrading ? "trading_research" : "bootstrap_self_improvement";
}

function summarizeAnchorDocs(docs) {
  return (Array.isArray(docs) ? docs : [])
    .filter((doc) => doc && typeof doc.path === "string")
    .map((doc) => {
      const content = typeof doc.content === "string" ? doc.content : "";
      const excerpt = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 6);
      return {
        path: doc.path,
        loaded: Boolean(content),
        excerpt,
      };
    });
}

function buildBootstrapProposal({ repo, activationText, desiredActivationDoc }) {
  if (!hasLiveWorkerAuthMarkers(activationText)) {
    return {
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
        "Document FOUNDEROS_WORKER_KEY alongside FOUNDEROS_PUBLIC_WRITE_KEY and the transitional FOUNDEROS_WRITE_KEY in the VM activation path.",
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
    };
  }

  return {
    kind: "safe_improvement_proposal",
    title: "Upgrade the worker from inspect-and-report to inspect-and-propose",
    priority: "high",
    rationale:
      "The system can inspect and report on itself, but it still lacks a structured inspect-and-propose contract that is ready for ledger promotion and later PR translation.",
    risk_level: "low",
    target_area: "services/openclaw result shaping and promotion-ready structured output",
    target_files: [
      "services/openclaw/worker-loop.sh",
      "tests/founderos-v1-contract.test.mjs",
    ],
    proposed_changes: [
      "Infer a lane from the job objective so repeated inspection jobs become easier to classify.",
      "Return a structured worker output object with required fields for summary, findings, tags, importance, promotion recommendation, and ledger-entry stubbing.",
      "Keep the bounded proposal block while making completed results easier to mirror into the outputs ledger.",
    ],
    acceptance_criteria: [
      "Completed worker results include a structured output object with lane, objective, summary, key findings, tags, importance, promotion recommendation, and ledger entry stub.",
      "Structured output remains inside the current PR-only guarded execution model and does not widen authority.",
      "Regression coverage verifies lane inference, structured output shape, and the docs-alignment fallback.",
    ],
    expected_outcome:
      "Founderos receives worker outputs that are easier to index, mirror, and act on without requiring manual reinterpretation every time.",
    candidate_write_set: {
      mode: "exact_write_set_candidate",
      repo,
      branch_name: "codex/worker-inspect-and-propose-contract",
      base_branch: "main",
      title: "Upgrade OpenClaw to a structured inspect-and-propose contract",
      rationale:
        "A structured inspect-and-propose contract makes worker outputs easier to promote into the outputs ledger and easier to turn into bounded implementation tracks.",
      files: [
        {
          path: "services/openclaw/worker-loop.sh",
          action: "update",
          intent: "Add lane-aware structured output fields alongside the bounded proposal block.",
        },
        {
          path: "tests/founderos-v1-contract.test.mjs",
          action: "update",
          intent: "Add regression coverage for lane inference and structured output shape.",
        },
      ],
    },
  };
}

function buildTradingProposal({
  repo,
  projectSlug,
  taskKind,
  provider,
  executionMode,
  strategyName,
  asset,
  timeframe,
  anchorDocs,
}) {
  const anchorPathsLoaded = summarizeAnchorDocs(anchorDocs)
    .filter((doc) => doc.loaded)
    .map((doc) => doc.path);

  const proposalMatrix = {
    trading_research: {
      title: "Advance the APS-centered trading research and object model contract",
      rationale:
        "The paper-trading-loop should produce strategy and governance outputs from its project anchors rather than snapping back to generic OpenClaw self-improvement.",
      branch_name: "codex/aps-trading-research-contract",
      target_files: [
        "projects/paper-trading-loop/research/trading-agent-research-notes.md",
        "projects/paper-trading-loop/trading-object-model.md",
        "docs/governance/amendments/AMENDMENT_005_FINANCIAL_CONNECTORS_AND_MONEY_PATH_CONTROL.md",
        "docs/governance/amendments/AMENDMENT_006_STRATEGY_EVALUATION_AND_PROMOTION_GATES.md",
        "docs/governance/amendments/AMENDMENT_007_AUTONOMOUS_LIVE_TRADING_AUTHORITY.md",
      ],
      proposed_changes: [
        "Load the paper-trading-loop anchors before planning or execution.",
        "Define trading-native APS objects for strategies, evaluation runs, candidates, approvals, connectors, orders, fills, positions, and live authority state.",
        "Keep APS as the only authority-crossing layer for broker mutations, risk policy, and kill switches.",
      ],
      acceptance_criteria: [
        "The worker reads project anchors and returns a trading-specific proposal instead of a generic self-improvement loop.",
        "Research notes capture the evaluation standard, baseline strategy, challenger strategy families, and promotion gates.",
        "The trading object model extends APS rather than bypassing it.",
      ],
    },
    trading_backtest: {
      title: "Add a governed backtest and evaluation-run contract",
      rationale:
        "Backtests should be promoted through APS-owned evaluation objects with research-backed metrics instead of ad hoc notebooks or informal summaries.",
      branch_name: "codex/aps-trading-backtest-contract",
      target_files: [
        "infra/supabase/trading.sql",
        "api/founderos/trading/backtests/[run_id].js",
        "docs/openapi.founderos.yaml",
        "tests/founderos-v1-contract.test.mjs",
      ],
      proposed_changes: [
        "Persist evaluation_run and strategy_definition objects in APS-owned storage.",
        "Require PBO, DSR, serial-correlation-aware Sharpe handling, and explicit turnover and cost assumptions.",
        "Expose one governed backtest read route through APS.",
      ],
      acceptance_criteria: [
        "A backtest run is readable through APS and tied to a strategy version.",
        "Evaluation artifacts record research-backed metrics and assumptions.",
        "The public APS contract stays read-only for backtest outputs and does not widen worker authority.",
      ],
    },
    trading_shadow_scan: {
      title: "Add a shadow scan and trade-candidate generation lane",
      rationale:
        "The yes or no operator loop needs a consistent candidate object generated from current market snapshots and strategy runs before any paper execution occurs.",
      branch_name: "codex/aps-shadow-scan-candidates",
      target_files: [
        "api/founderos/trading/candidates.js",
        "api/founderos/trading/candidates/[candidate_id].js",
        "projects/paper-trading-loop/journal-schema.md",
        "tests/founderos-v1-contract.test.mjs",
      ],
      proposed_changes: [
        "Generate compact trade_candidate objects from shadow scans and strategy runs.",
        "Keep the candidate object legible for a binary yes or no decision.",
        "Record candidate state, rationale, and invalidation in APS-owned objects.",
      ],
      acceptance_criteria: [
        "Candidates can be listed and read through APS.",
        "Candidates carry thesis, invalidation, sizing, and strategy metadata.",
        "The same candidate contract can later feed paper execution and journal updates.",
      ],
    },
    trading_paper_execute: {
      title: "Add APS-governed paper execution for Alpaca",
      rationale:
        "Paper execution should live behind APS-owned adapters, approval decisions, and risk policies so the VM never becomes the broker authority boundary.",
      branch_name: "codex/aps-paper-execution-controls",
      target_files: [
        "api/_lib/trading.js",
        "api/founderos/trading/candidates/[candidate_id]/decision.js",
        "api/founderos/trading/connectors/health.js",
        "infra/supabase/trading.sql",
      ],
      proposed_changes: [
        "Keep connector status, approvals, and witness logging inside APS-owned helpers and routes.",
        "Admit Alpaca paper as the first connector behind a narrow broker contract.",
        "Record approval_decision, broker_order, and fill_event objects under APS control.",
      ],
      acceptance_criteria: [
        "APS exposes candidate decision and connector health routes.",
        "Paper broker credentials stay server-side.",
        "Paper execution remains blocked from live authority unless later governance opens it.",
      ],
    },
    trading_live_stage: {
      title: "Stage APS-governed live authority without enabling autonomous live execution",
      rationale:
        "Live trading requires staged authority, connector admission, kill switches, and canary rules before any money-moving path becomes callable.",
      branch_name: "codex/aps-live-authority-staging",
      target_files: [
        "docs/governance/CONSTITUTION.md",
        "docs/governance/amendments/AMENDMENT_007_AUTONOMOUS_LIVE_TRADING_AUTHORITY.md",
        "projects/paper-trading-loop/authority-boundary.md",
      ],
      proposed_changes: [
        "Define live authority state and canary stages as explicit APS-governed objects.",
        "Require amendments, connector admission, and kill-switch tests before any live stage opens.",
        "Keep live staging reviewable and revocable.",
      ],
      acceptance_criteria: [
        "Live staging is described as a governed later phase, not implicit authority.",
        "APS remains the authority boundary for any real order transmission.",
        "Rollback, suspension, and witness requirements are explicit.",
      ],
    },
    trading_live_execute: {
      title: "Keep live execution constitutionally gated behind APS authority and amendments",
      rationale:
        "Autonomous live execution must remain explicitly staged, bounded, and revocable rather than silently introduced through worker code.",
      branch_name: "codex/aps-live-execution-guardrails",
      target_files: [
        "docs/governance/amendments/AMENDMENT_007_AUTONOMOUS_LIVE_TRADING_AUTHORITY.md",
        "projects/paper-trading-loop/what-not-to-build-yet.md",
        "docs/BOUNDARIES.md",
      ],
      proposed_changes: [
        "Document live execution as future governed authority only.",
        "Define the activation conditions, canary limits, and rollback path before admitting autonomy.",
        "Preserve APS ownership of risk checks, keys, and kill switches.",
      ],
      acceptance_criteria: [
        "Live execution remains blocked until governance, policy, and connector state all permit it.",
        "The worker cannot bypass APS for money-moving actions.",
        "Operational documents explain how autonomy can be suspended or revoked.",
      ],
    },
    trading_sync: {
      title: "Add trading sync and VM recovery checks for broker-state parity",
      rationale:
        "A fragile worker setup needs a bounded sync and reconcile loop that can verify commit freshness, connector health, and order-state parity after drift or restart.",
      branch_name: "codex/trading-sync-and-recovery",
      target_files: [
        "services/openclaw/check-worker.sh",
        "services/openclaw/reconcile-worker.sh",
        "projects/paper-trading-loop/README.md",
        "tests/founderos-v1-contract.test.mjs",
      ],
      proposed_changes: [
        "Use a trading-specific smoke objective instead of a generic inspect-and-propose objective.",
        "Verify worker commit freshness, project anchor loading, and connector health.",
        "Treat sync and recovery as first-class operator workflows.",
      ],
      acceptance_criteria: [
        "Worker smoke checks confirm a trading-shaped result.",
        "VM reconciliation verifies connector health and project anchor parity.",
        "The operator can recover the worker loop without losing the trading contract.",
      ],
    },
  };

  const chosen = proposalMatrix[taskKind] || proposalMatrix.trading_research;
  const intentForPath = (path) => `Advance ${taskKind} for ${projectSlug || "paper-trading-loop"} in ${path}.`;

  return {
    kind: "trading_lane_proposal",
    title: chosen.title,
    priority: taskKind === "trading_live_execute" ? "high" : "high",
    rationale: chosen.rationale,
    risk_level: taskKind.includes("live") ? "high" : "medium",
    target_area: "APS-centered trading worker dispatch and governance",
    target_files: chosen.target_files,
    anchor_paths_loaded: anchorPathsLoaded,
    strategy_profile: {
      provider: provider || "alpaca",
      execution_mode: executionMode || "paper",
      strategy_name: strategyName || "btc_usd_breakout_v1",
      asset: asset || "BTC/USD",
      timeframe: timeframe || "15m",
    },
    proposed_changes: chosen.proposed_changes,
    acceptance_criteria: chosen.acceptance_criteria,
    expected_outcome:
      "OpenClaw returns a project-aware trading proposal that advances the paper-trading-loop without bypassing APS authority or collapsing into generic self-improvement.",
    candidate_write_set: {
      mode: "exact_write_set_candidate",
      repo,
      branch_name: chosen.branch_name,
      base_branch: "main",
      title: chosen.title,
      rationale: chosen.rationale,
      files: chosen.target_files.map((path) => ({
        path,
        action: "update",
        intent: intentForPath(path),
      })),
    },
  };
}

function buildWorkerProposal(context) {
  if (context.taskKind === "bootstrap_self_improvement") {
    return buildBootstrapProposal(context);
  }

  return buildTradingProposal(context);
}

function buildStructuredOutput({
  job,
  repo,
  projectSlug,
  taskKind,
  objective,
  topPaths,
  activeSurface,
  workerProposal,
  anchorDocs,
}) {
  const lane = inferLane(objective, taskKind);
  const anchorSummary = summarizeAnchorDocs(anchorDocs);
  const taskFamily = taskKind.startsWith("trading_") ? "trading" : "bootstrap";
  const keyFindings = [
    taskFamily === "trading"
      ? "APS remains the authority boundary for broker mutations, risk policy, and witness logging."
      : "APS remains the authority boundary and durable write gate.",
    taskFamily === "trading"
      ? "Project anchors are loaded before planning so the worker stays attached to the paper-trading-loop objective."
      : "OpenClaw can claim, inspect, and complete jobs through the current async loop.",
    workerProposal.title,
  ];
  const tags = Array.from(
    new Set(
      [
        lane,
        taskFamily,
        "openclaw",
        taskFamily === "trading" ? "paper-trading-loop" : "inspect-and-propose",
        repo ? "repo" : null,
      ].filter(Boolean)
    )
  );
  return {
    task_family: taskFamily,
    task_kind: taskKind,
    project_slug: projectSlug || null,
    lane,
    objective,
    status: "completed",
    summary:
      taskFamily === "trading"
        ? "OpenClaw inspected the repo, loaded the paper-trading-loop anchors, and returned a trading-shaped bounded proposal."
        : "OpenClaw inspected the repo and returned a structured bounded proposal ready for easier ledger promotion.",
    key_findings: keyFindings,
    tags,
    importance: workerProposal.priority || "high",
    promotion_recommended: true,
    anchor_paths_loaded: anchorSummary.filter((doc) => doc.loaded).map((doc) => doc.path),
    ledger_entry_stub: {
      job_id: job.id || null,
      repo,
      title: workerProposal.title,
      focus: lane,
      summary: workerProposal.rationale,
      completed_at: new Date().toISOString(),
      top_paths: topPaths.slice(0, 5),
    },
    active_surface_sample: activeSurface.slice(0, 5),
  };
}

const taskKind = normalizeTaskKind(scope.task_kind, objective, projectSlug);
const workerProposal = buildWorkerProposal({
  repo,
  projectSlug,
  taskKind,
  activationText,
  desiredActivationDoc,
  provider,
  executionMode,
  strategyName,
  asset,
  timeframe,
  anchorDocs,
});
const structuredOutput = buildStructuredOutput({
  job,
  repo,
  projectSlug,
  taskKind,
  objective,
  topPaths,
  activeSurface,
  workerProposal,
  anchorDocs,
});
const anchorSummary = summarizeAnchorDocs(anchorDocs);
const tradingContext =
  taskKind.startsWith("trading_")
    ? {
        project_slug: projectSlug || "paper-trading-loop",
        provider: provider || "alpaca",
        execution_mode: executionMode || "paper",
        strategy_name: strategyName || "btc_usd_breakout_v1",
        asset: asset || "BTC/USD",
        timeframe: timeframe || "15m",
        aps_authority_model: "aps_owned_connectors_risk_and_execution",
        live_authority_stage: "paper_only_until_amended",
      }
    : null;
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
    worker_loop_mode: taskKind.startsWith("trading_") ? "project_aware_dispatch" : "inspect_and_propose",
    protected_write_boundary: "PR-only governed execution through APS",
  },
  current_limitations: [
    taskKind.startsWith("trading_")
      ? "Live broker mutations remain APS-governed and are not delegated to the VM."
      : "Worker returns structured inspection results but does not yet generate exact write sets.",
    taskKind.startsWith("trading_")
      ? "Autonomous live execution remains constitutionally gated behind later amendments."
      : "Autonomous PR creation is not yet wired through the async worker lane.",
    taskKind.startsWith("trading_")
      ? "The first complete loop remains narrow: one asset, one strategy, one approval gate, and paper-first execution."
      : "Durable memory kernel beyond orchestration history is still planned work.",
  ],
};

const result = {
  summary:
    taskKind.startsWith("trading_")
      ? "Project-aware trading worker inspection completed with a bounded proposal block."
      : "Initial worker self-state inspection completed with a bounded proposal block.",
  result: {
    repo,
    objective,
    project_slug: projectSlug || null,
    task_kind: taskKind,
    file_count: files.length,
    top_paths: topPaths,
    recommended_next_action:
      taskKind.startsWith("trading_")
        ? "Review the bounded trading proposal and promote the next APS-governed implementation target into an exact write set."
        : "Review the bounded safe improvement proposal and promote it into a PR-ready exact write set.",
    readme_excerpt: readmeLines,
    activation_doc_excerpt: activationLines,
    anchor_paths_loaded: anchorSummary.filter((doc) => doc.loaded).map((doc) => doc.path),
    anchor_excerpts: anchorSummary.slice(0, 8),
    self_state: selfState,
    trading_context: tradingContext,
    structured_output: structuredOutput,
    proposal: {
      status: taskKind === "trading_live_execute" ? "governance_gated_candidate_ready" : "bounded_candidate_ready",
      mode: workerProposal.candidate_write_set && workerProposal.candidate_write_set.mode
        ? workerProposal.candidate_write_set.mode
        : "proposal_only",
      title: workerProposal.title,
      rationale: workerProposal.rationale,
      target_files: workerProposal.target_files,
      acceptance_criteria: workerProposal.acceptance_criteria,
      candidate_write_set: workerProposal.candidate_write_set || null,
    },
    suggested_next_improvement: workerProposal,
  },
};

fs.writeFileSync(targetPath, JSON.stringify(result));
' "${tmp_file}"
}

inspect_job() {
  local claimed_json="$1"
  local job_id repo branch task_kind tree_json readme_json activation_doc_json payload_file
  local anchor_bundle_file anchor_json
  local -a anchor_paths=()

  job_id="$(printf '%s' "${claimed_json}" | json_field 'data.job.id')"
  repo="$(printf '%s' "${claimed_json}" | json_field 'data.job.repo || ""')"
  branch="$(printf '%s' "${claimed_json}" | json_field 'data.job.scope_json && data.job.scope_json.branch ? data.job.scope_json.branch : "main"')"
  task_kind="$(printf '%s' "${claimed_json}" | json_field 'data.job.scope_json && data.job.scope_json.task_kind ? data.job.scope_json.task_kind : ""' || true)"

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

  mapfile -t anchor_paths < <(printf '%s' "${claimed_json}" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const scope = data.job && data.job.scope_json && typeof data.job.scope_json === "object"
  ? data.job.scope_json
  : {};
const paths = Array.isArray(scope.anchor_paths) ? scope.anchor_paths : [];
for (const path of paths) {
  if (typeof path === "string" && path.trim()) {
    process.stdout.write(`${path.trim()}\n`);
  }
}
')
  anchor_bundle_file="$(mktemp)"
  printf '[]' >"${anchor_bundle_file}"

  if [[ "${#anchor_paths[@]}" -gt 0 ]]; then
    post_status "${job_id}" "planning" "Loading project anchors for ${task_kind:-bootstrap_self_improvement}" 0.55
  fi

  for anchor_path in "${anchor_paths[@]}"; do
    if anchor_json="$("${CLIENT}" repo-file "${repo}" "${anchor_path}" "${branch}" 2>/dev/null)"; then
      :
    else
      anchor_json='{"ok":false,"content":null}'
    fi
    node -e '
const fs = require("fs");
const bundlePath = process.argv[1];
const pathValue = process.argv[2];
const response = JSON.parse(process.argv[3] || "{}");
const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8"));
bundle.push({
  path: pathValue,
  ok: Boolean(response.ok),
  sha: response.sha || null,
  content: typeof response.content === "string" ? response.content : null,
});
fs.writeFileSync(bundlePath, JSON.stringify(bundle));
' "${anchor_bundle_file}" "${anchor_path}" "${anchor_json}"
  done

  payload_file="$(mktemp)"
  FOUNDEROS_TREE_JSON="${tree_json}" \
  FOUNDEROS_README_JSON="${readme_json}" \
  FOUNDEROS_ACTIVATION_DOC_JSON="${activation_doc_json}" \
  FOUNDEROS_ANCHOR_DOCS_JSON="$(cat "${anchor_bundle_file}")" \
  build_result_payload "${claimed_json}" "${payload_file}"
  rm -f "${anchor_bundle_file}"

  post_status "${job_id}" "write_set_ready" "Inspection summary prepared for ${task_kind:-bootstrap_self_improvement}" 0.9
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
