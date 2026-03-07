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

const tracks = [
  {
    id: "track-1",
    title: "Clarify scope and success criteria",
    kind: "planning",
    goal: `Turn the project objective into a bounded execution target for: ${short}`,
    request: `Inspect the repo and clarify the bounded scope, success criteria, and first coherent implementation target for this project objective: ${objective}`,
    suggested_paths: ["README.md", "docs/**", "memory/decisions/**"],
  },
  {
    id: "track-2",
    title: "Implement the smallest coherent core",
    kind: "implementation",
    goal: `Build the smallest coherent implementation step for: ${short}`,
    request: `Inspect the repo and implement the smallest coherent core change for this project objective: ${objective}. Prefer the minimal bounded PR that creates real forward progress.`,
    suggested_paths: ["apps/**", "services/**", "docs/**"],
  },
  {
    id: "track-3",
    title: "Validation and regression safety",
    kind: "validation",
    goal: `Add or improve validation around the first core step for: ${short}`,
    request: `Inspect the repo and add the smallest useful validation, regression coverage, or verification path for the current implementation step of this project objective: ${objective}.`,
    suggested_paths: ["services/**", "apps/**", "docs/**"],
  },
  {
    id: "track-4",
    title: "Operator visibility and documentation",
    kind: "visibility",
    goal: `Improve operator legibility for: ${short}`,
    request: `Inspect the repo and improve operator-facing visibility, workflow legibility, or documentation for this project objective: ${objective}. Prefer bounded docs or workflow-state improvements that make the work easier to review and continue.`,
    suggested_paths: ["README.md", "docs/**", "apps/**"],
  },
];

const plan = {
  version: 1,
  mode: "bounded_project_tracks",
  project_slug: slug,
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
