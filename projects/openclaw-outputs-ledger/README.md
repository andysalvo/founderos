# OpenClaw Outputs Ledger

This project is the lightweight GitHub mirror for important OpenClaw outputs.

## Purpose

Founderos already stores canonical worker truth in Supabase through:

- `orchestration_jobs`
- `orchestration_events`
- `plan_artifacts`
- `witness_events`

This ledger does **not** replace that canonical source.

Instead, this project provides a compact, human-readable and machine-readable mirror of the OpenClaw outputs that matter most for operator review and later reuse.

## Design rules

1. **Supabase is canonical.**
   - Job state, timing, artifacts, and raw result payloads live there first.

2. **GitHub is curated.**
   - Only important completed jobs are mirrored here.

3. **Every entry is referenceable.**
   - The primary key is `job_id`.

4. **Keep storage lean.**
   - Mirror summaries, findings, and next actions here.
   - Do not dump full raw event histories into the repo.

5. **Make it useful for both humans and tooling.**
   - `index.md` is optimized for reading.
   - `index.json` is optimized for scripts and future automation.
   - One Markdown file per mirrored job keeps the ledger simple.

## Structure

- `index.md` — human-readable overview
- `index.json` — machine-readable index
- `jobs/<job-id>.md` — one curated entry per important output

## Promotion rule

A completed worker job should be mirrored here only when at least one of the following is true:

- it produced a concrete bounded proposal
- it changed the direction of the system
- it created or directly led to a PR
- it produced a reusable finding, playbook, or experiment result

## Current limitation

This is the first simple version of the ledger.
It is intentionally static and curated.

The canonical live source remains Supabase.
Future tooling may automate promotion into this folder, but that should remain bounded and reviewable.
