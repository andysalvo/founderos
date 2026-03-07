#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLIENT="${ROOT_DIR}/services/openclaw/aps-client.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <job_id> <frozen_by>" >&2
  exit 1
fi

job_id="$1"
frozen_by="$2"

status_json="$(${CLIENT} job-status "${job_id}")"
payload_file="$(mktemp)"
trap 'rm -f "${payload_file}"' EXIT

printf '%s' "${status_json}" | node -e '
const fs = require("fs");
const input = fs.readFileSync(0, "utf8");
const data = JSON.parse(input || "{}");
const job = data.job || {};
const artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];

const candidate =
  job.result_json?.proposal?.candidate_write_set ||
  job.result_json?.suggested_next_improvement?.candidate_write_set ||
  job.result_json?.result?.proposal?.candidate_write_set ||
  job.result_json?.result?.suggested_next_improvement?.candidate_write_set ||
  null;

if (!candidate) {
  console.error("No candidate_write_set found in job status payload.");
  process.exit(2);
}

const planArtifactId = job.initial_artifact_id;
const planArtifact = artifacts.find((artifact) => artifact.id === planArtifactId);

if (!planArtifactId || !planArtifact?.content_hash) {
  console.error("Could not resolve initial plan artifact id/hash for job.");
  process.exit(3);
}

const files = Array.isArray(candidate.files) ? candidate.files : [];
if (!files.length) {
  console.error("Candidate write set has no files.");
  process.exit(4);
}

const normalizedFiles = files.map((file) => {
  if (!file.path || !file.action) {
    console.error("Candidate write set contains a file without path/action.");
    process.exit(5);
  }
  if (typeof file.content !== "string") {
    console.error(`Candidate file ${file.path} is intent-only and does not include exact content.`);
    process.exit(6);
  }
  return {
    path: file.path,
    action: file.action,
    content: file.content,
  };
});

const writeSet = {
  repo: candidate.repo || job.repo,
  base_branch: candidate.base_branch || "main",
  branch_name: candidate.branch_name || `codex/job-${job.id}`,
  title: candidate.title || `Promote worker candidate from ${job.id}`,
  body: candidate.rationale || `Promoted from worker job ${job.id}.`,
  files: normalizedFiles,
};

const payload = {
  write_set: writeSet,
  plan_artifact_id: planArtifactId,
  plan_artifact_hash: planArtifact.content_hash,
  frozen_by: process.argv[1],
};

process.stdout.write(JSON.stringify(payload, null, 2));
' "${frozen_by}" > "${payload_file}"

${CLIENT} freeze "${payload_file}"
