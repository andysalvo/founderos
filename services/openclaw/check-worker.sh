#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-/root/.config/founderos/aps.env}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLIENT="${ROOT_DIR}/services/openclaw/aps-client.sh"

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

echo "== Founderos worker env =="
echo "BASE_URL=${FOUNDEROS_BASE_URL}"
echo "WORKER_ID=${FOUNDEROS_WORKER_ID:-openclaw-worker}"

echo
echo "== Public APS capabilities =="
bash "${CLIENT}" capabilities >/tmp/founderos-capabilities-check.json
node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync("/tmp/founderos-capabilities-check.json", "utf8"));
if (!payload.ok) process.exit(1);
process.stdout.write(`ok=${payload.ok} endpoints=${Array.isArray(payload.endpoints) ? payload.endpoints.length : 0}\n`);
'

echo
echo "== Worker claim check =="
claim_output="$(bash "${CLIENT}" claim)"
printf '%s\n' "${claim_output}" >/tmp/founderos-claim-check.json
node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync("/tmp/founderos-claim-check.json", "utf8"));
if (!payload.ok) process.exit(1);
if (payload.job && payload.job.id) {
  process.stdout.write(`claimed_job=${payload.job.id}\n`);
} else {
  process.stdout.write("claimed_job=none\n");
}
'

echo
echo "worker check completed"
