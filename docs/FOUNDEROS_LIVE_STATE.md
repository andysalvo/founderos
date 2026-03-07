# Founderos Live State

Status: verified operational snapshot

This document captures what is live and working in Founderos right now.

Use this file when you need to quickly recover the current system shape without rereading the full master spec.

The north star remains [docs/FOUNDEROS_SYSTEM_SPEC.md](/Users/andysalvo_1/Documents/GitHub/founderos/docs/FOUNDEROS_SYSTEM_SPEC.md). This file is the shorter operational mirror.

## Live Architecture

Current verified runtime:

```text
ChatGPT Custom GPT
  -> public APS on Vercel
    -> Supabase orchestration and witness state
    -> private OpenClaw worker on VM
    -> GitHub repo reads through GitHub App auth
```

Current verified public APS base URL:

- `https://founderos-alpha.vercel.app`

Current verified private worker host:

- `https://claw.asalvocreative.com`

## Verified Public APS Surface

These public routes are active in the repo and exposed in the public schema:

- `GET /api/founderos/health`
- `GET /api/founderos/capabilities`
- `POST /api/founderos/capabilities/check`
- `POST /api/founderos/precommit/plan`
- `POST /api/founderos/repo/file`
- `POST /api/founderos/repo/tree`
- `POST /api/founderos/commit/execute`
- `POST /api/founderos/orchestrate/submit`
- `GET /api/founderos/orchestrate/jobs/{job_id}`

Worker-only routes exist in code and are intentionally not in the public OpenAPI schema:

- `POST /api/founderos/orchestrate/claim`
- `POST /api/founderos/orchestrate/jobs/{job_id}/heartbeat`
- `POST /api/founderos/orchestrate/jobs/{job_id}/complete`
- `POST /api/founderos/orchestrate/jobs/{job_id}/fail`

## Verified Async Loop

This loop has been verified end to end:

1. ChatGPT-compatible client submits an orchestration job to APS.
2. APS stores the job, initial plan artifact, orchestration event, and witness event in Supabase.
3. OpenClaw worker on the VM claims the job through worker auth.
4. Worker reads the repo tree and README through APS.
5. Worker posts heartbeat updates.
6. Worker completes the job with a structured inspection result.
7. APS returns durable status, events, artifacts, and result payload by `job_id`.

This means Founderos now has a real autonomous inspect-and-report loop that runs without the laptop terminal staying open.

## Current Worker Behavior

Current worker mode:

- poll for queued jobs
- claim one job
- inspect the repo tree
- inspect `README.md`
- return a structured self-state snapshot and a bounded next-improvement proposal

Current worker does not yet:

- generate exact write sets automatically
- open PRs through the async worker lane
- maintain a durable cognitive memory kernel beyond orchestration history

## Current Durable State

Verified active tables:

- `witness_events`
- `plan_artifacts`
- `orchestration_jobs`
- `orchestration_events`

Current role of each:

- `witness_events`: immutable execution and orchestration witness log
- `plan_artifacts`: durable planning/proposal artifacts
- `orchestration_jobs`: async job records and current status
- `orchestration_events`: append-only job timeline

## Current Operational Boundary

The system is autonomous only inside these constraints:

- public requests go through APS
- protected control-plane paths remain blocked
- durable code writes still require governed APS execution
- current async worker loop inspects and reports but does not directly self-modify
- consequential changes should still end in reviewable PRs

## Immediate Next Step

The next safe autonomy milestone is:

`inspect -> choose one safe improvement -> generate bounded candidate write set -> open PR`

That is the bridge from autonomous inspection to autonomous self-improvement by PR.

The worker is now moving toward the first half of that loop by returning:

- self-state
- target files
- rationale
- acceptance criteria
- a candidate write-set scaffold
