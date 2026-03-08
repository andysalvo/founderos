#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <project objective> [output_file]" >&2
  exit 1
fi

objective="$1"
output_file="${2:-}"

plan_json="$(OBJECTIVE="$objective" node -e '
const objective = (process.env.OBJECTIVE || "").trim();
if (!objective) {
  console.error("Project objective is required.");
  process.exit(1);
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "project";
}

const short = objective.length > 140 ? `${objective.slice(0, 137)}...` : objective;
const slug = slugify(objective);
const lower = objective.toLowerCase();

function inferTradingProfile(text) {
  const isTrading =
    text.includes("alpaca") ||
    text.includes("paper-trading") ||
    text.includes("paper trading") ||
    text.includes("crypto") ||
    text.includes("btc") ||
    text.includes("eth") ||
    text.includes("sol") ||
    text.includes("trading") ||
    text.includes("backtest") ||
    text.includes("strategy");

  if (!isTrading) {
    return null;
  }

  const asset = text.includes("eth") ? "ETH/USD" : text.includes("sol") ? "SOL/USD" : "BTC/USD";
  return {
    project_slug: "paper-trading-loop",
    provider: text.includes("alpaca") ? "alpaca" : "alpaca",
    execution_mode: text.includes("live") ? "paper" : "paper",
    strategy_name: "btc_usd_breakout_v1",
    asset,
    timeframe: text.includes("1h") ? "1h" : text.includes("5m") ? "5m" : "15m",
    anchor_paths: [
      "projects/paper-trading-loop/README.md",
      "projects/paper-trading-loop/alpaca-paper-mvp.md",
      "projects/paper-trading-loop/paper-first-architecture.md",
      "projects/paper-trading-loop/risk-rules.md",
      "projects/paper-trading-loop/journal-schema.md",
      "projects/paper-trading-loop/first-strategy.md",
      "projects/paper-trading-loop/authority-boundary.md",
      "projects/paper-trading-loop/research/trading-agent-research-notes.md",
      "projects/paper-trading-loop/trading-object-model.md",
      "docs/governance/CONSTITUTION.md",
    ],
    allowed_paths: [
      "projects/paper-trading-loop/**",
      "services/openclaw/**",
      "api/founderos/**",
      "api/_lib/**",
      "infra/supabase/**",
      "tests/**",
      "docs/**",
    ],
    forbidden_paths: [],
  };
}

function buildTrack(id, title, kind, goal, request, suggestedPaths, scope) {
  return {
    id,
    title,
    kind,
    goal,
    request,
    suggested_paths: suggestedPaths,
    scope,
  };
}

const tradingProfile = inferTradingProfile(lower);

const tracks = tradingProfile
  ? [
      buildTrack(
        "track-1",
        "Trading research and object model",
        "trading_research",
        `Define the APS-centered trading research target for: ${short}`,
        `Inspect the repo, load the paper-trading-loop anchors, and return the next APS-centered trading research target for this project objective: ${objective}. Keep APS as the authority boundary and treat GitHub docs as the organized source of truth for the project definition.`,
        [
          "projects/paper-trading-loop/**",
          "docs/governance/**",
          "api/_lib/**",
          "docs/openapi.founderos.yaml",
        ],
        { ...tradingProfile, task_kind: "trading_research" }
      ),
      buildTrack(
        "track-2",
        "Backtest and evaluation contract",
        "trading_backtest",
        `Define the evaluation and backtest contract for: ${short}`,
        `Inspect the repo and turn the trading research target into a bounded APS-centered backtest and evaluation contract for this project objective: ${objective}. Record research-backed evaluation requirements such as PBO, DSR, serial-correlation-aware statistics, and explicit cost assumptions.`,
        [
          "projects/paper-trading-loop/**",
          "infra/supabase/**",
          "api/founderos/trading/**",
          "tests/**",
        ],
        { ...tradingProfile, task_kind: "trading_backtest" }
      ),
      buildTrack(
        "track-3",
        "Shadow scan and candidate generation",
        "trading_shadow_scan",
        `Define the forward paper candidate path for: ${short}`,
        `Inspect the repo and define the bounded shadow-scan and trade-candidate generation contract for this project objective: ${objective}. Keep the output legible for a yes or no decision and preserve APS ownership of approvals and execution policy.`,
        [
          "projects/paper-trading-loop/**",
          "services/openclaw/**",
          "api/founderos/trading/**",
          "tests/**",
        ],
        { ...tradingProfile, task_kind: "trading_shadow_scan" }
      ),
      buildTrack(
        "track-4",
        "Paper execution and APS controls",
        "trading_paper_execute",
        `Define the APS-governed paper execution path for: ${short}`,
        `Inspect the repo and define the smallest coherent APS-governed paper execution implementation target for this project objective: ${objective}. Keep broker keys, risk checks, approval state, and witness logging inside APS-owned adapters and policy.`,
        [
          "api/founderos/trading/**",
          "api/_lib/**",
          "infra/supabase/**",
          "projects/paper-trading-loop/**",
        ],
        { ...tradingProfile, task_kind: "trading_paper_execute" }
      ),
      buildTrack(
        "track-5",
        "Sync, recovery, and operator checks",
        "trading_sync",
        `Define the sync and VM recovery contract for: ${short}`,
        `Inspect the repo and define the bounded trading sync, reconciliation, and VM recovery contract for this project objective: ${objective}. Prefer operator legibility, restart safety, broker-state parity, and smoke checks over speculative automation.`,
        [
          "services/openclaw/**",
          "projects/paper-trading-loop/**",
          "docs/**",
          "tests/**",
        ],
        { ...tradingProfile, task_kind: "trading_sync" }
      ),
    ]
  : [
      buildTrack(
        "track-1",
        "Clarify scope and success criteria",
        "bootstrap_self_improvement",
        `Turn the project objective into a bounded execution target for: ${short}`,
        `Inspect the repo and clarify the bounded scope, success criteria, and first coherent implementation target for this project objective: ${objective}`,
        ["README.md", "docs/**", "memory/decisions/**"],
        {
          project_slug: slug,
          task_kind: "bootstrap_self_improvement",
          anchor_paths: ["README.md", "docs/OPENCLAW_APS_ACTIVATION.md"],
          allowed_paths: ["README.md", "docs/**", "services/openclaw/**"],
          forbidden_paths: [],
        }
      ),
      buildTrack(
        "track-2",
        "Implement the smallest coherent core",
        "bootstrap_self_improvement",
        `Build the smallest coherent implementation step for: ${short}`,
        `Inspect the repo and implement the smallest coherent core change for this project objective: ${objective}. Prefer the minimal bounded PR that creates real forward progress.`,
        ["apps/**", "services/**", "docs/**"],
        {
          project_slug: slug,
          task_kind: "bootstrap_self_improvement",
          anchor_paths: ["README.md", "docs/OPENCLAW_APS_ACTIVATION.md"],
          allowed_paths: ["apps/**", "services/**", "docs/**"],
          forbidden_paths: [],
        }
      ),
      buildTrack(
        "track-3",
        "Validation and regression safety",
        "bootstrap_self_improvement",
        `Add or improve validation around the first core step for: ${short}`,
        `Inspect the repo and add the smallest useful validation, regression coverage, or verification path for the current implementation step of this project objective: ${objective}.`,
        ["services/**", "apps/**", "docs/**"],
        {
          project_slug: slug,
          task_kind: "bootstrap_self_improvement",
          anchor_paths: ["README.md", "docs/OPENCLAW_APS_ACTIVATION.md"],
          allowed_paths: ["services/**", "apps/**", "docs/**"],
          forbidden_paths: [],
        }
      ),
      buildTrack(
        "track-4",
        "Operator visibility and documentation",
        "bootstrap_self_improvement",
        `Improve operator legibility for: ${short}`,
        `Inspect the repo and improve operator-facing visibility, workflow legibility, or documentation for this project objective: ${objective}. Prefer bounded docs or workflow-state improvements that make the work easier to review and continue.`,
        ["README.md", "docs/**", "apps/**"],
        {
          project_slug: slug,
          task_kind: "bootstrap_self_improvement",
          anchor_paths: ["README.md", "docs/OPENCLAW_APS_ACTIVATION.md"],
          allowed_paths: ["README.md", "docs/**", "apps/**"],
          forbidden_paths: [],
        }
      ),
    ];

const plan = {
  version: 1,
  mode: "bounded_project_tracks",
  project_slug: tradingProfile ? tradingProfile.project_slug : slug,
  objective,
  track_count: tracks.length,
  tracks,
};

process.stdout.write(JSON.stringify(plan, null, 2));
')"

if [[ -n "$output_file" ]]; then
  printf '%s\n' "$plan_json" > "$output_file"
else
  printf '%s\n' "$plan_json"
fi
