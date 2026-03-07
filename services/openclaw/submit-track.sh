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

track_request="$(TRACK_SELECTOR="$track_selector" node - "$plan_file" <<'NODE'
const fs = require('fs');
const planPath = process.argv[2];
const selector = (process.env.TRACK_SELECTOR || '').trim();
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
process.stdout.write(track.request.trim());
NODE
)"

if [[ -z "$track_request" ]]; then
  echo "Resolved track request is empty." >&2
  exit 1
fi

"$CLIENT" submit "$track_request" "$repo" "$branch" "$requested_by"
