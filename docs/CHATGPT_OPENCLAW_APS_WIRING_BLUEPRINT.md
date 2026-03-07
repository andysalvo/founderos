# ChatGPT-OpenClaw-APS Wiring Blueprint

Status: supporting architecture reference. The canonical replacement for overall system truth is [docs/FOUNDEROS_SYSTEM_SPEC.md](./FOUNDEROS_SYSTEM_SPEC.md). This document remains the detailed wiring appendix for the target async GPT -> APS -> OpenClaw architecture.

## Purpose

This document defines the canonical production wiring for the Founderos system we actually want:

`ChatGPT Custom GPT -> Founderos APS (public OpenAPI on Vercel) -> OpenClaw worker habitat on the VM -> APS write/log spine -> GitHub + Supabase`

The goal is to let a user talk to a Custom GPT in ChatGPT and say things like:

> Inspect your repo, figure out how to improve it, and build the next good change.

The system should then:

1. inspect the allowlisted repo,
2. reason in multiple passes,
3. create durable orchestration records,
4. produce exact write sets,
5. open PRs through APS,
6. log all durable execution through Supabase.

This blueprint is grounded in:

- the current Founderos APS v1 repo and docs,
- the currently working OpenClaw VM habitat,
- current OpenAI GPT Actions product constraints,
- current OpenClaw plugin/gateway architecture.

## Current Baseline In This Repo

The existing repo already gives us the control-plane core:

- public/read-only APS endpoints:
  - `GET /api/founderos/health`
  - `GET /api/founderos/capabilities`
- authenticated APS endpoints:
  - `POST /api/founderos/capabilities/check`
  - `POST /api/founderos/precommit/plan`
  - `POST /api/founderos/repo/file`
  - `POST /api/founderos/repo/tree`
  - `POST /api/founderos/commit/execute`
- protected-path policy and narrow commitment boundary:
  - `api/founderos/**`
  - `docs/openapi.founderos.yaml`
  - `.env*`
  - `.github/workflows/**`
  - `vercel.json`
- witness-before-write behavior backed by Supabase
- GitHub App based repo reads/writes through APS
- GPT Builder setup guidance based on the existing OpenAPI schema

Source-of-truth repo docs:

- [README.md](../README.md)
- [docs/openapi.founderos.yaml](./openapi.founderos.yaml)
- [docs/GPT_BUILDER_SETUP.md](./GPT_BUILDER_SETUP.md)
- [docs/GPT_INSTRUCTIONS.md](./GPT_INSTRUCTIONS.md)
- [docs/BOUNDARIES.md](./BOUNDARIES.md)
- [docs/OPENCLAW_APS_ACTIVATION.md](./OPENCLAW_APS_ACTIVATION.md)
- [docs/DEPLOY_LOCAL_VM.md](./DEPLOY_LOCAL_VM.md)

## Canonical Architecture

### Public reasoning front door

`ChatGPT Custom GPT` is the only public reasoning surface for v1.

- The user interacts with ChatGPT.
- The GPT uses `Custom Actions` imported from the Founderos public OpenAPI schema.
- GPT Actions call APS over HTTPS on a public production domain.
- GPT does not call OpenClaw directly.

### Public API surface

`Founderos APS on Vercel` is the only public API that GPT Actions call.

- Production public domain: `https://aps.asalvocreative.com`
- GPT auth header: `x-founderos-key`
- Existing `docs/openapi.founderos.yaml` remains the base public schema
- The public GPT-facing schema should only expose GPT-facing operations
- Internal worker endpoints and auto-execute endpoints must not be imported into GPT Builder

### Private worker habitat

`OpenClaw on the VM` is the async worker habitat.

- Operator console domain: `https://claw.asalvocreative.com`
- OpenClaw remains valuable for:
  - persistent agent habitat
  - workspace grounding
  - sessions
  - built-in tools
  - future node/device/channel features
- OpenClaw is not the public GPT Action surface
- OpenClaw is not a second control plane

### Audit spine

`Supabase` remains the durable logging and witness system.

- `witness_events` stays the immutable execution ledger
- new orchestration tables live alongside witness logging
- no durable GitHub write happens before APS records the required witness event

## Why This Wiring Is Canonical

This design is the most standard and feasible path because:

- GPT Actions are built around public HTTPS OpenAPI endpoints, not private WebSocket agent runtimes.
- GPT Action calls time out after 45 seconds, so long-running repo inspection/build loops must move off the request path.
- OpenClaw is strongest as a private in-process agent habitat, not as the public GPT Action contract.
- APS already owns repo policy, GitHub auth, witness logging, and durable execution.

This also reflects what we observed locally:

- a custom OpenClaw plugin tool could be installed and loaded,
- but the OpenClaw web Chat surface did not reliably expose that tool to the active chat session,
- so the current OpenClaw dashboard chat is not the primary bridge for GPT-to-APS orchestration in v1.

That path is deferred, not deleted.

## Domain And Environment Layout

### Public domains

- `aps.asalvocreative.com`
  - public HTTPS API for GPT Actions
  - hosted on Vercel
  - imports from the public Founderos OpenAPI schema
- `claw.asalvocreative.com`
  - operator dashboard and OpenClaw habitat
  - not used as a GPT Action endpoint

### Private runtime layout

- Vercel APS holds:
  - `FOUNDEROS_WRITE_KEY`
  - `FOUNDEROS_WORKER_KEY`
  - `ALLOWED_REPOS`
  - GitHub App credentials
  - Supabase credentials
- OpenClaw VM holds:
  - OpenClaw runtime state
  - repo workspaces/worktrees
  - `FOUNDEROS_BASE_URL=https://aps.asalvocreative.com`
  - `FOUNDEROS_WORKER_KEY`
- OpenClaw VM does **not** hold:
  - GitHub App private key
  - Supabase service-role key
  - the public GPT Action key unless needed for development

### Current local APS on VM

The existing VM-local APS can remain as a development/smoke-test tool, but it is not the production public API for GPT Builder.

Production GPT Builder should target Vercel APS only.

## Public GPT-Facing Flow

There are two supported GPT behaviors.

### 1. Short synchronous reasoning

Use existing direct APS endpoints when the task is small enough to finish inside GPT Action limits:

- `capabilities`
- `repoTree`
- `repoFile`
- `precommitPlan`

Use this path for:

- quick repo inspection
- reading specific files
- summarizing docs
- producing proposal artifacts without durable execution

### 2. Long-running inspect/build loop

Use the async orchestration path when the user asks for something like:

- inspect the repo and figure out how to improve it
- review the codebase and implement the next change
- explore the repo, plan work, and create a PR

In this mode:

1. GPT calls `POST /api/founderos/orchestrate/submit`
2. APS persists a job and returns immediately with `job_id`
3. OpenClaw worker claims the job
4. OpenClaw performs deep inspection/planning in its private habitat
5. APS records artifacts/events
6. if allowed, APS executes the resulting write set by opening a PR
7. GPT polls `GET /api/founderos/orchestrate/jobs/{job_id}` until complete

GPT does not wait on OpenClaw directly.

## APS v2 API Evolution

APS v2 extends the existing v1 contract. It does not replace the existing read and planning endpoints.

### Public GPT-facing endpoints

These are included in the public OpenAPI schema used by GPT Builder.

#### `POST /api/founderos/orchestrate/submit`

Purpose:

- start an async repo-inspection or improvement job

Auth:

- `x-founderos-key`

OpenAPI consequence flag:

- `x-openai-isConsequential: true`

Request body:

```json
{
  "objective": "Inspect Founderos and figure out how to improve its own repo.",
  "repo": "andysalvo/founderos",
  "base_branch": "main",
  "mode": "improve",
  "constraints": ["stay within allowlisted paths", "prefer the smallest coherent PR"]
}
```

Rules:

- `repo` must be in `ALLOWED_REPOS`
- `mode` is one of:
  - `inspect_only`
  - `improve`
- this endpoint must return quickly and never wait for the full worker run

Response body:

```json
{
  "ok": true,
  "job_id": "job_123",
  "status": "queued",
  "initial_plan_artifact_id": "plan_123",
  "initial_plan_artifact_hash": "sha256...",
  "poll_after_seconds": 5
}
```

#### `GET /api/founderos/orchestrate/jobs/{job_id}`

Purpose:

- fetch current job status and latest durable outputs

Auth:

- `x-founderos-key`

Response body:

```json
{
  "ok": true,
  "job_id": "job_123",
  "status": "executing",
  "mode": "improve",
  "repo": "andysalvo/founderos",
  "created_at": "2026-03-07T00:00:00Z",
  "updated_at": "2026-03-07T00:02:00Z",
  "latest_summary": "Inspected the repo, generated a write set, and opened a PR.",
  "latest_plan_artifact_id": "plan_456",
  "latest_plan_artifact_hash": "sha256...",
  "latest_write_set_hash": "sha256...",
  "pr_url": "https://github.com/owner/repo/pull/123",
  "witness_ids": ["uuid-1", "uuid-2"],
  "error": null,
  "done": false
}
```

### Worker-only endpoints

These are **not** included in the GPT-facing OpenAPI schema.

Use worker auth only:

- header: `x-founderos-worker-key`
- env var on the worker: `FOUNDEROS_WORKER_KEY`

Endpoints:

- `POST /api/founderos/orchestrate/claim`
- `POST /api/founderos/orchestrate/jobs/{job_id}/heartbeat`
- `POST /api/founderos/orchestrate/jobs/{job_id}/complete`
- `POST /api/founderos/orchestrate/jobs/{job_id}/fail`

Responsibilities:

- claim queued jobs
- extend leases/heartbeats
- attach progress summaries
- publish refined plan artifacts and exact write sets
- mark completion/failure

### Internal auto-write endpoint

This is also worker-only and must not appear in the GPT-facing schema.

#### `POST /api/founderos/commit/auto-execute`

Purpose:

- let the OpenClaw worker ask APS to perform a PR-only execution without a human approval click

Auth:

- `x-founderos-worker-key`

Request body:

```json
{
  "job_id": "job_123",
  "plan_artifact_id": "plan_456",
  "plan_artifact_hash": "sha256...",
  "execution_summary": "Generated the smallest valid PR for the objective.",
  "authorized_by": "openclaw-worker:vm-1",
  "write_set": {
    "repo": "andysalvo/founderos",
    "base_branch": "main",
    "branch_name": "codex/job-123-improve-docs",
    "title": "Improve APS/OpenClaw wiring docs",
    "body": "Generated from orchestrate job job_123.",
    "files": [
      {
        "path": "docs/example.md",
        "action": "update",
        "content": "..."
      }
    ]
  }
}
```

Behavior:

- validate repo allowlist
- validate protected-path policy
- reject destructive actions in v1
- compute and validate exact write-set hash
- write witness event before GitHub writes begin
- create branch and PR through the same GitHub App path APS already uses
- return PR metadata and witness ids

Non-goal:

- no direct push to `main`

## Public Schema Policy

The public GPT-facing OpenAPI schema should include:

- `health`
- `capabilities`
- `capabilitiesCheck`
- `repoFile`
- `repoTree`
- `precommitPlan`
- `orchestrateSubmit`
- `orchestrateJobStatus`

The public GPT-facing schema should **not** include:

- worker claim/heartbeat/complete/fail endpoints
- `commit/auto-execute`

`commitExecute` may continue to exist server-side for manual/human-driven flows, but it is not the canonical GPT-facing operation in this architecture.

## Supabase Data Model

The production system persists four record types.

### 1. `plan_artifacts`

Purpose:

- persist all durable planning artifacts

Minimum fields:

- `id`
- `created_at`
- `job_id` nullable
- `repo`
- `mode`
- `artifact_json`
- `content_hash`
- `created_by`

Why:

- current `precommitPlan` artifacts are returned but not stored server-side
- async orchestration needs durable artifact references

### 2. `orchestration_jobs`

Purpose:

- represent the current state of each async inspection/build job

Minimum fields:

- `id`
- `created_at`
- `updated_at`
- `repo`
- `base_branch`
- `mode`
- `objective`
- `status`
- `created_by`
- `assigned_worker`
- `latest_plan_artifact_id`
- `latest_write_set_hash`
- `latest_summary`
- `pr_url`
- `error_json`

Canonical statuses:

- `queued`
- `claimed`
- `inspecting`
- `planning`
- `write_set_ready`
- `executing`
- `completed`
- `failed`
- `blocked`

### 3. `orchestration_events`

Purpose:

- append-only timeline for each job

Minimum fields:

- `id`
- `job_id`
- `ts`
- `event_type`
- `actor`
- `summary`
- `payload_json`

Canonical event types:

- `submitted`
- `claimed`
- `inspected`
- `plan_persisted`
- `write_set_generated`
- `auto_execute_started`
- `pr_opened`
- `failed`
- `blocked`

### 4. `witness_events`

Purpose:

- immutable execution ledger

This already exists and remains mandatory for durable writes.

## OpenClaw Worker Design

### Role

OpenClaw is the private async worker habitat. It is not the public GPT Action surface.

### Service

Define a VM-side adapter service:

- systemd unit: `founderos-openclaw-worker.service`

### Worker responsibilities

- poll APS claim endpoint with `x-founderos-worker-key`
- create or refresh an isolated job workspace
- run the job through OpenClaw in that workspace
- post heartbeats/progress/results back to APS
- request `commit/auto-execute` only through APS

### Worker boundaries

- this is an adapter around OpenClaw, not a second control plane
- APS remains authoritative for:
  - allowed repos
  - protected paths
  - write execution policy
  - witness logging
  - GitHub writes

### Worker runtime contract

For each claimed job, the worker should:

1. create an isolated worktree under something like:
   - `/root/.openclaw/workspace/jobs/<job_id>/repo`
2. sync the target repo/ref into that worktree
3. invoke OpenClaw through its supported CLI/gateway interface
4. require OpenClaw to return strict JSON output
5. convert that JSON into persisted artifacts and, if present, an exact `write_set`
6. call APS completion or failure endpoints

### OpenClaw invocation choice

For v1, the worker should use the supported OpenClaw CLI/gateway path rather than a custom chat plugin:

- invoke OpenClaw with a dedicated job session
- keep the repo worktree as the OpenClaw workspace context for that run
- require structured JSON output from the job prompt

The worker should not depend on:

- the OpenClaw web dashboard chat tool picker
- custom OpenClaw plugin tools being visible in Chat mode

### OpenClaw output contract

For `inspect_only`, OpenClaw should return JSON shaped like:

```json
{
  "summary": "Short repo diagnosis.",
  "files_reviewed": ["README.md", "docs/openapi.founderos.yaml"],
  "insights": ["The public schema still exposes v1-only execution semantics."],
  "recommended_next_steps": ["Add async orchestration endpoints."]
}
```

For `improve`, OpenClaw should return JSON shaped like:

```json
{
  "summary": "Short description of the intended change.",
  "files_reviewed": ["docs/...", "api/..."],
  "title": "PR title",
  "body": "PR body",
  "proposed_files": [
    {
      "path": "docs/example.md",
      "action": "update",
      "content": "..."
    }
  ]
}
```

The worker adapter is responsible for turning `proposed_files` into the exact APS `write_set` shape.

## Execution Policy

The chosen v1 execution policy is:

- autonomous execution across the whole allowlisted repo,
- except for existing protected APS/control-plane paths,
- and only through PR creation.

### Hard server-side constraints

APS must enforce all of the following:

- repo must be in `ALLOWED_REPOS`
- protected paths remain blocked exactly as they are today
- file actions are limited to `create` and `update` in v1
- path traversal, absolute paths, and duplicate paths remain rejected
- writes remain exact-write-set based
- worker identity is recorded as the execution actor
- all durable writes are witness-logged before GitHub writes begin
- execution creates a branch and PR; it never pushes directly to `main`

### What changes from v1

Current `commit.execute` requires explicit human authorization.

In the new architecture:

- `commit.execute` remains available for human-approved/manual flows
- `commit/auto-execute` is the worker-only path for autonomous PR creation

This preserves the current v1 safety model while adding a separate machine-driven lane.

## GPT Builder Configuration

### GPT configuration

Use a Custom GPT with `Custom Actions`.

The GPT should:

- import the public Founderos OpenAPI schema
- authenticate with API key auth using `x-founderos-key`
- use the strongest currently available model in the workspace that supports custom actions
- not hardcode a specific model number in system design or prompts

### GPT operating policy

The GPT should:

- use `capabilities`, `repoTree`, `repoFile`, and `precommitPlan` for short direct reasoning
- use `orchestrate/submit` for long-running inspect/build tasks
- poll `orchestrate/jobs/{job_id}` instead of waiting on a long action
- never claim a write happened unless APS status says it happened
- summarize APS JSON, not fabricate execution status

### Consequentiality choices

In the public schema:

- `precommitPlan` should be marked non-consequential
- `orchestrateSubmit` should be marked consequential because it can trigger downstream automation and PR creation

## Rejected And Deferred Paths

### Not canonical for v1

- `ChatGPT -> OpenClaw chat dashboard -> custom OpenClaw APS plugin`
- `ChatGPT -> direct OpenClaw WebSocket/Gateway protocol`
- `ChatGPT -> n8n -> everything else`
- `OpenClaw as the public GPT Action endpoint`

### Deferred until later

- making the OpenClaw dashboard chat reliably expose custom APS tools
- local-model inference on the VM
- destructive file actions
- direct auto-merge or direct push-to-main behavior
- a second public API in front of APS

## Assumptions And Defaults

These defaults are locked for v1 unless there is an explicit architectural change.

- keep Vercel as the public APS host for GPT Actions
- keep the current OpenClaw VM as the private worker habitat
- keep OpenClaw on hosted-provider models first; no local inference is required for this wiring
- treat OpenClaw plugins as trusted in-process code, but do not rely on the custom Chat tool route for v1
- `auto-execute allowed paths` means the whole allowlisted repo except existing protected APS/control-plane paths
- all autonomous execution remains PR-only with full APS witness logging and no direct push to `main`

## Implementation Order

Implement in this order:

1. keep APS v1 stable
2. add Supabase orchestration tables
3. add APS v2 async orchestration endpoints on Vercel
4. define the worker auth key and worker-only endpoints
5. add `commit/auto-execute` as a worker-only PR path
6. build `founderos-openclaw-worker.service` on the VM
7. update the public OpenAPI schema for GPT-facing endpoints only
8. update GPT Builder instructions and import the public schema
9. test the full inspect -> plan -> PR -> witness flow end to end

## Acceptance Criteria

The wiring is correct when all of the following are true:

1. GPT Builder imports the APS schema from the production domain and authenticates successfully with `x-founderos-key`.
2. `GET /api/founderos/capabilities` and `POST /api/founderos/orchestrate/submit` work from GPT Actions within OpenAI production constraints.
3. A prompt like "inspect Founderos and figure out how to improve its own repo" returns a `job_id`.
4. The OpenClaw worker claims the job and runs the task inside the existing OpenClaw habitat.
5. `GET /api/founderos/orchestrate/jobs/{job_id}` shows durable progress, artifact references, and final status.
6. If the resulting write set is allowed, APS opens a PR and records both orchestration events and witness events in Supabase.
7. If the resulting write set touches a protected path, APS rejects execution and records the rejection without writing to GitHub.
8. The OpenClaw dashboard may be up or down without breaking the public GPT Action API, because GPT talks to APS, not directly to OpenClaw.

## Research Grounding

### Local repo grounding

- [README.md](../README.md)
- [docs/openapi.founderos.yaml](./openapi.founderos.yaml)
- [docs/GPT_BUILDER_SETUP.md](./GPT_BUILDER_SETUP.md)
- [docs/GPT_INSTRUCTIONS.md](./GPT_INSTRUCTIONS.md)
- [docs/BOUNDARIES.md](./BOUNDARIES.md)
- [docs/OPENCLAW_APS_ACTIVATION.md](./OPENCLAW_APS_ACTIVATION.md)
- [docs/DEPLOY_LOCAL_VM.md](./DEPLOY_LOCAL_VM.md)
- [legacy/docs/OPENCLAW_BRIDGE.md](../legacy/docs/OPENCLAW_BRIDGE.md)

### Official product constraints

- OpenAI GPT Actions production notes:
  - 45 second round-trip timeout
  - HTTPS/TLS on port 443
  - mixed auth/public endpoints allowed
  - `x-openai-isConsequential` support
  - https://developers.openai.com/api/docs/actions/production
- OpenAI GPT Action authentication:
  - https://developers.openai.com/api/docs/actions/authentication
- OpenAI GPT creation and importing actions from OpenAPI:
  - https://help.openai.com/en/articles/8554397-creating-a-gpt%3F.iso
- OpenAI GPT model availability changes for custom actions:
  - https://help.openai.com/en/articles/8555535
  - https://help.openai.com/en/articles/10128477-chatgpt-enterprise-edu-release-notes%23.svgz
- OpenClaw plugin/gateway architecture:
  - plugins run in-process with the gateway
  - plugins can register tools, HTTP routes, and background services
  - config lives under `plugins.entries.<id>.config`
  - https://docs.openclaw.ai/tools/plugin

## Final Decision

The production system should be built as:

`ChatGPT Custom GPT -> public APS on Vercel -> private OpenClaw worker on the VM -> APS execution/logging -> GitHub + Supabase`

That is the wiring to implement.
