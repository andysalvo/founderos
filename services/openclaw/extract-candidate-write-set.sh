#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLIENT="${ROOT_DIR}/services/openclaw/aps-client.sh"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <job_id> [output_file]" >&2
  exit 1
fi

job_id="$1"
output_file="${2:-}"

status_json="$(${CLIENT} job-status "${job_id}")"

candidate_json="$(printf '%s' "${status_json}" | node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
const data = JSON.parse(input || "{}");
const candidates = [
  data.job?.result_json?.proposal?.candidate_write_set,
  data.job?.result_json?.suggested_next_improvement?.candidate_write_set,
  data.job?.result_json?.result?.proposal?.candidate_write_set,
  data.job?.result_json?.result?.suggested_next_improvement?.candidate_write_set,
].filter(Boolean);

if (!candidates.length) {
  console.error("No candidate_write_set found in job status payload.");
  process.exit(2);
}

process.stdout.write(JSON.stringify(candidates[0], null, 2));
' 2>/dev/null)"

if [[ -z "${candidate_json}" ]]; then
  echo "No candidate_write_set found for job ${job_id}" >&2
  exit 1
fi

if [[ -n "${output_file}" ]]; then
  printf '%s\n' "${candidate_json}" > "${output_file}"
else
  printf '%s\n' "${candidate_json}"
fi
