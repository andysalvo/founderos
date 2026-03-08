#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLIENT="${ROOT_DIR}/services/openclaw/aps-client.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <plan_file> <track_id_or_index> [repo] [branch] [requested_by]" >&2
  exit 1
fi

plan_file="$1"
track_selector="$2"
repo="${3:-andysalvo/founderos}"
branch="${4:-main}"
requested_by="${5:-openclaw-track-submit}"

if [[ ! -f "$plan_file" ]]; then
  echo "Plan file not found: $plan_file" >&2
  exit 1
fi

payload_file="$(mktemp)"
trap 'rm -f "${payload_file}"' EXIT

TRACK_SELECTOR="$track_selector" REPO="$repo" BRANCH="$branch" REQUESTED_BY="$requested_by" node - "$plan_file" "$payload_file" <<'NODE'
const fs = require('fs');
const planPath = process.argv[2];
const payloadPath = process.argv[3];
const selector = (process.env.TRACK_SELECTOR || '').trim();
const repo = (process.env.REPO || '').trim();
const branch = (process.env.BRANCH || 'main').trim();
const requestedBy = (process.env.REQUESTED_BY || 'openclaw-track-submit').trim();
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const tracks = Array.isArray(plan.tracks) ? plan.tracks : [];
if (!tracks.length) {
  console.error('Plan file contains no tracks.');
  process.exit(2);
}
let track = tracks.find((item) => item.id === selector);
if (!track && /^\d+$/.test(selector)) {
  track = tracks[Number(selector)] || null;
}
if (!track || typeof track.request !== 'string' || !track.request.trim()) {
  console.error(`Track not found or missing request: ${selector}`);
  process.exit(3);
}
const trackScope = track && track.scope && typeof track.scope === 'object' ? track.scope : {};
const payload = {
  user_request: track.request.trim(),
  requested_by: requestedBy,
  requested_by_lane: 'worker_bootstrap',
  requested_by_subject_type: 'worker',
  scope: {
    repo,
    branch,
    allowed_paths: Array.isArray(trackScope.allowed_paths) ? trackScope.allowed_paths : [],
    forbidden_paths: Array.isArray(trackScope.forbidden_paths) ? trackScope.forbidden_paths : [],
    project_slug: typeof trackScope.project_slug === 'string' ? trackScope.project_slug : '',
    task_kind: typeof trackScope.task_kind === 'string' ? trackScope.task_kind : '',
    anchor_paths: Array.isArray(trackScope.anchor_paths) ? trackScope.anchor_paths : [],
    provider: typeof trackScope.provider === 'string' ? trackScope.provider : '',
    execution_mode: typeof trackScope.execution_mode === 'string' ? trackScope.execution_mode : '',
    strategy_name: typeof trackScope.strategy_name === 'string' ? trackScope.strategy_name : '',
    asset: typeof trackScope.asset === 'string' ? trackScope.asset : '',
    timeframe: typeof trackScope.timeframe === 'string' ? trackScope.timeframe : '',
  },
};
fs.writeFileSync(payloadPath, JSON.stringify(payload, null, 2));
NODE

"$CLIENT" submit-json "$payload_file"
