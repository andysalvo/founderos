# Founderos System Spec

Status: canonical master specification

This document is the primary source of truth for Founderos as a system.

It defines:

- what Founderos is,
- what is implemented in this repo today,
- what the target system is,
- how ChatGPT, APS, OpenClaw, Supabase, and GitHub fit together,
- where credentials belong,
- how to rebuild the system from scratch,
- how memory and state are modeled,
- how the system may improve itself under human supervision.

Supporting references remain important, but they are subordinate to this document:

- [README.md](../README.md)
- [AGENTS.md](../AGENTS.md)
- [docs/CHATGPT_OPENCLAW_APS_WIRING_BLUEPRINT.md](./CHATGPT_OPENCLAW_APS_WIRING_BLUEPRINT.md)
- [docs/BOUNDARIES.md](./BOUNDARIES.md)
- [docs/openapi.founderos.yaml](./openapi.founderos.yaml)

## Executive Thesis

Founderos is a private founder operating system.

It is not a generic agent platform, not a public SaaS product, and not a freeform autonomous blob. Its purpose is to let one operator work through a conversational interface while the system turns intent into governed action across code, state, documents, and future service adapters.

The core design principle is:

`natural language is the interface; policy, state, and audit are the substrate`

Founderos is designed to:

- let a human work through ChatGPT,
- keep durable authority and policy in APS,
- use OpenClaw as a private worker habitat,
- use Supabase as the durable state and memory spine,
- use GitHub as the code and tool-definition spine,
- improve itself gradually through bounded PR-based changes under supervision.

## Canonical Architecture

### System diagram

```text
ChatGPT Custom GPT
  -> Founderos APS (public HTTPS/OpenAPI on Vercel)
    -> OpenClaw worker habitat on the VM
    -> Supabase state + storage + witness ledger
    -> GitHub repo reads/writes through GitHub App auth
```

### Four planes

| Plane | System | Role |
| --- | --- | --- |
| Interface plane | ChatGPT Custom GPT | Public conversational interface and intent capture |
| Execution plane | APS + OpenClaw | Policy enforcement, orchestration, bounded work execution |
| State plane | Supabase Postgres + Storage | Durable state, memory, artifacts, witness ledger, future documents |
| Code plane | GitHub | Source of truth for code, adapters, specs, and self-improvement PRs |

### Roles and authority boundaries

| Component | Canonical role | Must not become |
| --- | --- | --- |
| ChatGPT | Public reasoning front door and action caller | Durable source of truth, secret store, or execution authority |
| APS | Policy and action authority | General-purpose chat surface or second memory system |
| OpenClaw | Private worker habitat with persistent sessions and workspaces | Public GPT Action endpoint or independent control plane |
| Supabase | Durable state, memory, witness, artifacts, and future storage spine | Unstructured dumping ground without object model or provenance |
| GitHub | Code spine and PR-based self-improvement path | General memory database |

### Canonical flow

1. The operator speaks to a ChatGPT Custom GPT.
2. The GPT calls APS through a public OpenAPI contract.
3. APS validates auth, policy, and repo scope.
4. APS either serves a short synchronous read/planning request or creates an async orchestration job.
5. OpenClaw performs bounded private work against an isolated workspace.
6. APS records durable state in Supabase and performs GitHub writes only through governed execution paths.
7. The operator reviews consequential outcomes and authorizes anything outside the system's automatic boundary.

## Current Seed Implementation In This Repo

This repo already contains a real control-plane seed. It is not the full founder OS yet, but it is not hypothetical either.

### Active verified APS v1 surface

These routes exist in code and are covered by the contract test in [tests/founderos-v1-contract.test.mjs](../tests/founderos-v1-contract.test.mjs):

- `GET /api/founderos/health`
- `GET /api/founderos/capabilities`
- `POST /api/founderos/capabilities/check`
- `POST /api/founderos/precommit/plan`
- `POST /api/founderos/repo/file`
- `POST /api/founderos/repo/tree`
- `POST /api/founderos/commit/freeze-write-set`
- `POST /api/founderos/commit/execute`
- `POST /api/founderos/commit/merge-pr`
- `POST /api/founderos/orchestrate/submit`
- `GET /api/founderos/orchestrate/jobs/{job_id}`
- `GET /api/founderos/trading/candidates`
- `POST /api/founderos/trading/candidates/shadow-scan`
- `GET /api/founderos/trading/candidates/{candidate_id}`
- `POST /api/founderos/trading/candidates/{candidate_id}/decision`
- `GET /api/founderos/trading/journal`
- `GET /api/founderos/trading/backtests/{run_id}`
- `GET /api/founderos/trading/connectors/health`

Primary implementation paths:

- [api/_lib/founderos-v1.js](../api/_lib/founderos-v1.js)
- [api/founderos/repo/file.js](../api/founderos/repo/file.js)
- [api/founderos/repo/tree.js](../api/founderos/repo/tree.js)
- [api/founderos/commit/execute.js](../api/founderos/commit/execute.js)
- [api/founderos/commit/merge-pr.js](../api/founderos/commit/merge-pr.js)
- [api/founderos/orchestrate/submit.js](../api/founderos/orchestrate/submit.js)
- [api/founderos/orchestrate/jobs/[job_id].js](../api/founderos/orchestrate/jobs/[job_id].js)
- [api/_lib/trading.js](../api/_lib/trading.js)
- [api/founderos/trading/candidates.js](../api/founderos/trading/candidates.js)
- [api/founderos/trading/candidates/shadow-scan.js](../api/founderos/trading/candidates/shadow-scan.js)
- [api/founderos/trading/candidates/[candidate_id].js](../api/founderos/trading/candidates/[candidate_id].js)
- [api/founderos/trading/candidates/[candidate_id]/decision.js](../api/founderos/trading/candidates/[candidate_id]/decision.js)
- [api/founderos/trading/journal.js](../api/founderos/trading/journal.js)
- [api/founderos/trading/backtests/[run_id].js](../api/founderos/trading/backtests/[run_id].js)
- [api/founderos/trading/connectors/health.js](../api/founderos/trading/connectors/health.js)
- [docs/openapi.founderos.yaml](./openapi.founderos.yaml)

### Current safety invariants

The active v1 seed enforces these invariants today:

- authenticated routes require `x-founderos-key` with server-side secret validation,
- `FOUNDEROS_PUBLIC_WRITE_KEY` is the preferred public/user key and `FOUNDEROS_WRITE_KEY` remains a compatibility fallback for the same lane,
- `precommit/plan` is proposal-only and does not perform durable writes,
- `commit/execute` and `commit/merge-pr` are the only durable GitHub write paths,
- `commit/execute` is exact-write-set based and hash-bound,
- `commit/merge-pr` is explicit-authorization based, allowlisted-repo only, squash-only, protected-branch only, and blocked unless checks are green,
- GitHub writes happen only after witness logging succeeds,
- policy-bearing artifacts are classified explicitly and protected control-plane paths are blocked,
- raw model text does not directly become shell, Git, SQL, or mutating external API input without deterministic validation,
- APS-owned trading routes expose candidate review, journal reads, backtest reads, and connector readiness without delegating broker authority to the VM,
- broker and market-data credentials remain APS-owned and server-side,
- GitHub App credentials and Supabase credentials remain server-side.

Protected paths currently blocked by server policy:

- `api/founderos/**`
- `api/_lib/**`
- `docs/openapi.founderos.yaml`
- `docs/GPT_INSTRUCTIONS.md`
- `docs/BOUNDARIES.md`
- `docs/FOUNDEROS_SYSTEM_SPEC.md`
- `docs/GPT_BUILDER_SETUP.md`
- `infra/supabase/**`
- `.env*`
- `.github/workflows/**`
- `vercel.json`

Policy-bearing artifacts that are explicitly classified but not auto-blocked include:

- `memory/decisions/**`
- `services/openclaw/**`
- `docs/FOUNDEROS_LIVE_STATE.md`

These are grounded in:

- [docs/BOUNDARIES.md](./BOUNDARIES.md)
- [api/_lib/founderos-v1.js](../api/_lib/founderos-v1.js)
- [api/founderos/commit/execute.js](../api/founderos/commit/execute.js)

### Current runtime and deployment model

The current seed assumes:

- APS is deployed as Vercel functions from the root `api/` directory,
- GitHub reads and writes happen through GitHub App auth,
- witness logging is stored in Supabase using [infra/supabase/witness_events.sql](../infra/supabase/witness_events.sql),
- a lightweight OpenClaw-side APS client can call APS using the preferred public key lane plus the separate worker key lane through [services/openclaw/aps-client.sh](../services/openclaw/aps-client.sh).

Current public-domain examples in repo docs:

- `https://founderos-alpha.vercel.app` for the active example APS deployment

Target production domains already described in the wiring blueprint:

- `https://aps.asalvocreative.com` for public APS
- `https://claw.asalvocreative.com` for the private/operator OpenClaw habitat

The system spec treats `founderos-alpha.vercel.app` as the documented current example and `aps.asalvocreative.com` / `claw.asalvocreative.com` as the target production naming pattern.

### Current OpenClaw activation path

The current seed supports a simple VM-side activation pattern:

- OpenClaw or a shell on the VM receives `FOUNDEROS_BASE_URL`,
- OpenClaw or the operator uses `FOUNDEROS_PUBLIC_WRITE_KEY` or the transitional `FOUNDEROS_WRITE_KEY`,
- the APS client script calls `capabilities`, `repo-file`, `repo-tree`, `plan`, `execute`, and the explicit human-directed `merge-pr` helper when needed.

This current activation path is documented in:

- [docs/OPENCLAW_APS_ACTIVATION.md](./OPENCLAW_APS_ACTIVATION.md)
- [docs/DEPLOY_LOCAL_VM.md](./DEPLOY_LOCAL_VM.md)

### Current APS-centered trading object expansion

The current repo now also contains an APS-centered trading object model and storage scaffold rather than an ad hoc trading blob.

Current object families added for the trading path:

- `strategy_definitions`
- `evaluation_runs`
- `market_snapshots`
- `signal_runs`
- `trade_candidates`
- `approval_decisions`
- `risk_policies`
- `broker_connectors`
- `broker_orders`
- `fill_events`
- `position_states`
- `kill_switch_events`
- `live_authority_states`
- `trade_journal`

The canonical storage scaffold for these objects currently lives in:

- [infra/supabase/trading.sql](../infra/supabase/trading.sql)

The project-level research and type-model references currently live in:

- [projects/paper-trading-loop/research/trading-agent-research-notes.md](../projects/paper-trading-loop/research/trading-agent-research-notes.md)
- [projects/paper-trading-loop/trading-object-model.md](../projects/paper-trading-loop/trading-object-model.md)

## Target System Spec

The target system is larger than the current APS v1 seed. The v1 seed remains the active verified baseline; the sections below describe the canonical next system that Founderos is building toward.

### Target public architecture

The canonical target system is:

`ChatGPT Custom GPT -> public APS -> private OpenClaw worker -> Supabase + GitHub`

The public GPT Action surface belongs to APS, not OpenClaw.

### Public GPT-facing lanes

#### Lane 1: short synchronous reasoning

Use this lane for requests that fit safely within GPT Action timing limits:

- inspect capabilities,
- read repo structure,
- read specific files,
- produce proposal artifacts without durable execution.

Active operations for this lane:

- `capabilities`
- `capabilitiesCheck`
- `repoFile`
- `repoTree`
- `precommitPlan`

#### Lane 2: long-running inspect/build orchestration

Use this lane for requests that require multiple reasoning passes or asynchronous work:

- inspect the repo and find the next improvement,
- plan a larger change,
- generate an exact write set and open a PR,
- future document/memory/retrieval workflows that exceed synchronous limits.

Target public operations for this lane:

- `POST /api/founderos/orchestrate/submit`
- `GET /api/founderos/orchestrate/jobs/{job_id}`

The GPT should submit the job, receive a `job_id`, and poll APS for durable status. GPT must not wait on OpenClaw directly.

### Worker-only execution layer

The private worker lane is APS-mediated and must not appear in the public GPT-facing OpenAPI schema.

Target worker auth:

- header: `x-founderos-worker-key`
- env var: `FOUNDEROS_WORKER_KEY`

Target worker-only endpoints:

- `POST /api/founderos/orchestrate/claim`
- `POST /api/founderos/orchestrate/jobs/{job_id}/heartbeat`
- `POST /api/founderos/orchestrate/jobs/{job_id}/complete`
- `POST /api/founderos/orchestrate/jobs/{job_id}/fail`
- `POST /api/founderos/commit/auto-execute`

### Target job lifecycle

Canonical target statuses:

- `queued`
- `claimed`
- `inspecting`
- `planning`
- `write_set_ready`
- `executing`
- `completed`
- `failed`
- `blocked`

Expected target flow:

1. GPT submits a job to APS.
2. APS stores the job and its initial artifact in Supabase.
3. OpenClaw claims the job with worker auth.
4. OpenClaw inspects the repo or state in an isolated workspace.
5. OpenClaw posts progress, artifacts, and exact write-set candidates back to APS.
6. APS decides whether the write set is allowed.
7. APS opens a PR through GitHub App auth if the write set is allowed.
8. APS records orchestration events plus witness events in Supabase.

### Target auto-execute lane

`commit/auto-execute` is the target worker-only PR path.

Its non-negotiable rules:

- repo must be allowlisted,
- protected paths remain blocked,
- file actions remain bounded by server policy,
- witness logging must happen before GitHub writes,
- execution creates a branch and PR only,
- no direct push to `main`,
- worker identity is recorded as the actor.

### Narrow governed merge lane

The current upgrade adds a separate public APS merge lane:

- `POST /api/founderos/commit/merge-pr`

Its non-negotiable rules are narrower than PR creation:

- repo must be allowlisted,
- authorization must be explicit and scoped to `merge_pull_request`,
- base branch must already be protected,
- head SHA must match the authorized SHA,
- GitHub checks must already be green,
- merge method is fixed to `squash`,
- GitHub branch protection is not bypassed,
- merge results are witness-logged before and after the GitHub merge call,
- this route does not grant any general GitHub edit authority.

### Public schema policy

The public GPT-facing schema should include:

- active read/planning routes from v1,
- the narrow governed `commit/merge-pr` route,
- target orchestration submit/status routes from v2,
- no worker claim/heartbeat/complete/fail endpoints,
- no worker-only `commit/auto-execute`.

## Memory And State Kernel

Founderos needs human-like operating memory without losing auditability. The design is intentionally split:

- `witness memory`: exact, immutable record of what happened
- `cognitive memory`: weighted, retrievable, revisable memory used for reasoning

This makes the system both governable and improveable.

### Memory design rules

1. Raw chats, tool outputs, API responses, and execution events are source material.
2. Distilled memory objects are the canonical long-term memory.
3. `witness_events` are immutable and append-only.
4. Working memory is a small active subset, not the full database.
5. Retrieval and consolidation policies are upgradeable.
6. Core provenance and audit invariants are not optional.
7. State should answer three questions:
   - what do I know?
   - what happened?
   - what can I do next?

### Schema-stable, policy-upgradeable design

The Supabase layer should be improveable by the agent, but only at the policy layer by default.

Stable kernel:

- witness ledger shape and append-only behavior,
- provenance fields,
- durable object identities,
- schema version history,
- migration history,
- evaluation history for retrieval/memory upgrades.

Upgradeable policies:

- embeddings,
- chunking/parsing,
- graph construction,
- retrieval/reranking,
- consolidation/summarization,
- salience/decay weighting,
- critic/evaluation loops,
- domain-specific adapters and indexes.

### Canonical state tables

| Object / table | Purpose | Status |
| --- | --- | --- |
| `witness_events` | Immutable execution ledger | Active now |
| `plan_artifacts` | Durable planning artifacts returned by APS | Target next |
| `orchestration_jobs` | Async job state | Target next |
| `orchestration_events` | Append-only job timeline | Target next |
| `memory_items` | Canonical long-term memory objects | Target next |
| `memory_edges` | Relationships between memories, docs, projects, and tasks | Target next |
| `working_memory` | Small active task/session memory set | Target next |
| `retrieval_events` | Retrieval traces, recall outcomes, corrections | Target next |
| `consolidation_runs` | Replay/summarization history | Target next |
| `documents` | Human-readable docs and document metadata | Target next |
| `storage_objects` | PDF/blob/object metadata plus storage backend | Target next |
| `tasks` | Actionable units across projects | Target next |
| `decisions` | Human and agent decisions with rationale | Target next |
| `connectors` | External service adapters and config metadata | Target next |

### Canonical durable objects

Founderos should treat the following as first-class durable objects across the system:

- `companies`
- `projects`
- `goals`
- `tasks`
- `jobs`
- `decisions`
- `documents`
- `artifacts`
- `chats`
- `memory_items`
- `connectors`
- `witness_events`

### Memory object rules

Each canonical memory item should eventually include:

- `kind`
- `summary`
- `content_json`
- `source_kind`
- `epistemic_status`
- `confidence`
- `salience`
- `strength`
- `created_at`
- `last_retrieved_at`
- `retrieval_count`
- supporting links to events, documents, or other objects

Canonical `source_kind` examples:

- `chat`
- `tool`
- `api`
- `document`
- `repo`
- `human_note`
- `inference`

Canonical `epistemic_status` examples:

- `observed`
- `user_stated`
- `documented`
- `tool_confirmed`
- `inferred`
- `hypothesis`

### Documents and storage

Founderos must support both structured rows and stored files.

Target model:

- `documents` stores metadata, purpose, ownership, and links to other objects,
- `storage_objects` stores file/blob metadata and backend location,
- Supabase Storage is the default first target,
- external backends such as CMS or website services may be added later through connectors without changing the core object model.

This is the path for future PDFs, company documents, research artifacts, and other binary objects.

## Key And Credential Ledger

Never store live secret values in this repo or in this document.

The ledger below records where each key belongs, who owns it, and how it is used so the system can be rebuilt cleanly.

### Environment variables and owned secrets

| Name | Owning system | Stored where | Used by | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| `FOUNDEROS_PUBLIC_WRITE_KEY` | APS | Vercel env vars; manual entry into GPT Builder or VM env when needed | Public/user APS routes | Active now | Preferred public lane key |
| `FOUNDEROS_WRITE_KEY` | APS | Vercel env vars; manual entry into GPT Builder or VM env when needed | Compatibility fallback for public/user APS routes and existing scripts | Transitional | Keep working during migration to `FOUNDEROS_PUBLIC_WRITE_KEY` |
| `FOUNDEROS_WORKER_KEY` | APS | Vercel env vars and worker VM env | Worker-only orchestration and auto-execute routes | Active now | Separate machine lane from GPT/user lane |
| `ALLOWED_REPOS` | APS | Vercel env vars | APS repo read/write allowlist enforcement | Active now | Comma-separated repo list |
| `GITHUB_APP_ID` | APS | Vercel env vars | APS GitHub App auth | Active now | Matches the created GitHub App |
| `GITHUB_INSTALLATION_ID` | APS | Vercel env vars | APS GitHub App auth | Active now | Installation on the target repo/org |
| `GITHUB_APP_PRIVATE_KEY` | APS | Vercel env vars only | APS GitHub App auth | Active now | Preserve PEM newlines or escaped `\n` |
| `SUPABASE_URL` | APS | Vercel env vars | Witness writes and future state-plane access | Active now | Points to the Supabase project |
| `SUPABASE_SERVICE_ROLE_KEY` | APS | Vercel env vars only | Server-side witness/state writes | Active now | Never place on the VM or in prompts |
| `FOUNDEROS_BASE_URL` | Worker / VM | VM env files | APS client script and future worker service | Active now | Current examples use `founderos-alpha`; target production uses `aps.asalvocreative.com` |
| model provider keys | OpenClaw/OpenWebUI runtime | VM secrets or provider-managed config | Model inference only | External / existing | Keep outside APS unless a server-side adapter specifically needs them |
| future service keys | Connector-specific APS adapters | Vercel env vars by default | Narrow server-side adapters only | Future | Stripe, storage/CMS, notebook UI, ad platforms, and other integrations follow this pattern |

### Manual secret/config placements outside env vars

These are not repo-tracked env vars, but they still need organized handling:

- ChatGPT Builder action key entry: the key value should equal `FOUNDEROS_PUBLIC_WRITE_KEY` when present, otherwise `FOUNDEROS_WRITE_KEY`.
- GitHub App setup: App creation, installation, and private key generation happen in GitHub, then values are copied into Vercel.
- DNS and TLS settings: managed in the chosen DNS/provider layer, not in repo env files.
- VM SSH access and bootstrap credentials: managed separately from Founderos application secrets.

### Key handling rules

- Secrets live in server-side env vars or operator-controlled secret stores, not in prompts.
- New external services are added by creating a narrow APS adapter, not by handing the model a raw provider token.
- OpenClaw should not receive GitHub App private keys or Supabase service-role keys directly.
- Rotate keys by updating the owning secret store first, then updating any manual consumer such as GPT Builder.

## Rebuild From Scratch Runbook

This section describes the canonical build order for recreating Founderos from zero.

### 1. Prepare the systems of record

Create or confirm:

- one GitHub repo for Founderos code,
- one Vercel project for APS,
- one Supabase project for witness/state,
- one VM for OpenClaw and related operator tooling,
- one public domain for APS and, optionally, one operator domain for OpenClaw/OpenWebUI.

### 2. Prepare Supabase

1. Create the Supabase project.
2. Apply [infra/supabase/witness_events.sql](../infra/supabase/witness_events.sql).
3. Record `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Treat future memory/orchestration tables as next-phase additions, not prerequisites for v1.

### 3. Prepare GitHub App auth

1. Create a GitHub App with the permissions required for repo contents and pull requests.
2. Install it on the repo(s) in `ALLOWED_REPOS`.
3. Record:
   - `GITHUB_APP_ID`
   - `GITHUB_INSTALLATION_ID`
   - `GITHUB_APP_PRIVATE_KEY`
4. Store all three in Vercel only.

### 4. Deploy APS to Vercel

1. Create the Vercel project from this repo.
2. Add the required env vars:
   - `FOUNDEROS_PUBLIC_WRITE_KEY`
   - `FOUNDEROS_WRITE_KEY`
   - `ALLOWED_REPOS`
   - `GITHUB_APP_ID`
   - `GITHUB_INSTALLATION_ID`
   - `GITHUB_APP_PRIVATE_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. For target async orchestration, add `FOUNDEROS_WORKER_KEY`.
4. Deploy the root `api/` surface.
5. Verify:
   - `GET /api/founderos/health`
   - `GET /api/founderos/capabilities`
   - `POST /api/founderos/capabilities/check`

Reference:

- [docs/DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)

### 5. Wire ChatGPT Builder

1. Open ChatGPT GPT Builder.
2. Import or paste [docs/openapi.founderos.yaml](./openapi.founderos.yaml).
3. Configure API key auth using header `x-founderos-key`.
4. Set the key value to `FOUNDEROS_PUBLIC_WRITE_KEY` when present, otherwise `FOUNDEROS_WRITE_KEY`.
5. Use [docs/GPT_INSTRUCTIONS.md](./GPT_INSTRUCTIONS.md) as the starting policy.
6. Confirm the GPT can call `capabilities` and `capabilitiesCheck`.

Reference:

- [docs/GPT_BUILDER_SETUP.md](./GPT_BUILDER_SETUP.md)

### 6. Prepare the OpenClaw VM

1. Provision the VM.
2. Install OpenClaw and any operator UI stack you choose to use.
3. Create the VM env file with:
   - `FOUNDEROS_BASE_URL`
   - `FOUNDEROS_PUBLIC_WRITE_KEY` or the transitional `FOUNDEROS_WRITE_KEY` for the public/user APS lane
4. For the target worker path, add:
   - `FOUNDEROS_WORKER_KEY`
5. Place [services/openclaw/aps-client.sh](../services/openclaw/aps-client.sh) on the VM.
6. Confirm the VM can call:
   - `capabilities`
   - `repo-tree`
   - `repo-file`
   - `plan`

References:

- [docs/OPENCLAW_APS_ACTIVATION.md](./OPENCLAW_APS_ACTIVATION.md)
- [docs/DEPLOY_LOCAL_VM.md](./DEPLOY_LOCAL_VM.md)
- [docs/OPENCLAW_OPENWEBUI_SETUP.md](./OPENCLAW_OPENWEBUI_SETUP.md)

### 7. Verify the current seed

Expected v1 verification sequence:

1. run `npm test`,
2. verify public capabilities routes,
3. verify authenticated capabilities check,
4. verify `repo-tree` against an allowlisted repo,
5. verify `repo-file` against an allowlisted repo,
6. verify `precommit/plan`,
7. verify `commit/execute` only with an exact authorized write set.

### 8. Add the target async system

After the v1 seed is stable:

1. add orchestration tables in Supabase,
2. add APS orchestration submit/status routes,
3. add worker claim/heartbeat/complete/fail routes,
4. add worker-only `commit/auto-execute`,
5. build the OpenClaw worker service,
6. add state/memory retrieval and consolidation loops.

## Piece It Together From An Existing Stack

This section is for an operator who already has some of the infrastructure and needs to finish the wiring without rebuilding everything.

### If APS already exists

Do this:

1. confirm the deployed env vars match the ledger above,
2. verify the current contract with `health`, `capabilities`, and `capabilitiesCheck`,
3. confirm `ALLOWED_REPOS`, GitHub App auth, and witness schema are in place.

### If OpenClaw already exists on the VM

Do this:

1. add `FOUNDEROS_BASE_URL`,
2. add `FOUNDEROS_PUBLIC_WRITE_KEY` or the transitional `FOUNDEROS_WRITE_KEY` for the public/user lane,
3. place the APS client script on the VM,
4. verify repo read and plan calls before attempting execution,
5. add `FOUNDEROS_WORKER_KEY` for the worker lane,
6. verify worker heartbeats and runtime commit attribution before trusting long-running jobs.

### If ChatGPT Builder already exists

Do this:

1. make sure the imported action schema matches [docs/openapi.founderos.yaml](./openapi.founderos.yaml),
2. verify the key uses header `x-founderos-key`,
3. confirm GPT instructions reflect the narrow APS boundary,
4. test `capabilities` first, then authenticated routes.

### If Supabase already exists

Do this:

1. verify [infra/supabase/witness_events.sql](../infra/supabase/witness_events.sql) has been applied,
2. confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are stored in Vercel,
3. treat future memory/orchestration schemas as additive migrations.

### Minimum completion checklist

Founderos is minimally pieced together when all of the following are true:

- ChatGPT can call APS,
- APS can read the allowlisted repo through GitHub App auth,
- APS can write witness records to Supabase,
- OpenClaw or the VM can call APS with one narrow key,
- an exact authorized write set can open a PR through APS.

## Self-Improvement Policy

Founderos is designed to improve itself, but not to erase its own guardrails.

### May improve automatically by PR

Subject to repo allowlisting, PR-only execution, and existing protected-path policy, the system may propose or execute bounded improvements such as:

- docs,
- application code outside protected control-plane paths,
- retrieval/indexing/consolidation policies,
- memory/object schemas added outside the protected APS boundary,
- evaluation harnesses,
- domain adapters,
- repo organization and task artifacts.

### Always requires explicit human review or approval

- changes that touch credentials or secret handling,
- changes to auth boundaries,
- changes to protected paths,
- changes to witness-before-write behavior,
- changes to `ALLOWED_REPOS`,
- payments, deployments, data collection, or public publishing,
- destructive file actions if they are ever introduced,
- production integrations that can move money, contact customers, or alter legal/financial records.

These constraints are aligned with [AGENTS.md](../AGENTS.md) and [docs/BOUNDARIES.md](./BOUNDARIES.md).

### Core invariants that are not self-modifiable by default

- append-only witness semantics,
- server-side secret handling,
- PR-only execution for autonomous changes,
- separation of GPT-facing auth and worker auth,
- protected-path enforcement,
- truthful tool/action reporting,
- schema and policy changes recorded through versioned PRs and witnessable execution.

### Improveable memory and RAG layer

Founderos should eventually learn from usage, but through governed upgrades:

- collect retrieval traces and corrections,
- evaluate new retrieval/consolidation policies against saved tasks,
- allow the agent to propose schema or policy changes by PR,
- require approval before promoting changes that affect the canonical memory kernel.

This is where machine learning, advanced RAG, graph retrieval, and critic/eval loops belong: in improveable policies around a stable memory kernel.

## Future Domain Packs

Future domain packs extend the same kernel. They are not separate systems.

### Finance / accounting operator

Purpose:

- connect Stripe and future financial systems through APS adapters,
- reconcile transactions and obligations,
- maintain artifacts, decisions, and tax-relevant records,
- keep the human in the sign-off loop for filings, payments, and consequential finance actions.

Kernel objects emphasized:

- documents,
- connectors,
- decisions,
- tasks,
- witness events,
- future ledger-style artifacts.

### Notebook / day organizer / visual planning UI

Purpose:

- turn chats, memory items, goals, tasks, and documents into an operator notebook,
- support daily planning and project coordination,
- connect to a future visual UI service without moving the system of record out of Founderos.

Kernel objects emphasized:

- goals,
- tasks,
- projects,
- decisions,
- chats,
- memory items,
- documents.

### Advertising / marketing operator

Purpose:

- support future campaign planning, creative iteration, experiment tracking, and performance review through adapters,
- treat ad accounts and external tools as connectors over the same memory/state spine.

Kernel objects emphasized:

- projects,
- goals,
- tasks,
- documents,
- artifacts,
- connectors,
- decisions.

## Reference Map

Use these files to ground implementation and recovery work:

| Path | Role |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | Execution contract, handoff format, and operator approval rules |
| [README.md](../README.md) | Repo entry point and current high-level description |
| [docs/openapi.founderos.yaml](./openapi.founderos.yaml) | Canonical public APS v1 OpenAPI contract |
| [api/_lib/founderos-v1.js](../api/_lib/founderos-v1.js) | Shared v1 auth, hashing, endpoint registry, and protected-path helpers |
| [api/founderos/commit/execute.js](../api/founderos/commit/execute.js) | Exact authorized write-set execution path |
| [api/founderos/repo/file.js](../api/founderos/repo/file.js) | Allowlisted single-file GitHub read path |
| [api/founderos/repo/tree.js](../api/founderos/repo/tree.js) | Allowlisted repo tree read path |
| [tests/founderos-v1-contract.test.mjs](../tests/founderos-v1-contract.test.mjs) | Verified v1 contract and safety expectations |
| [docs/BOUNDARIES.md](./BOUNDARIES.md) | Current non-negotiable boundaries and non-goals |
| [infra/supabase/witness_events.sql](../infra/supabase/witness_events.sql) | Active witness ledger schema |
| [docs/DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md) | Current APS deployment guide |
| [docs/GPT_BUILDER_SETUP.md](./GPT_BUILDER_SETUP.md) | GPT Builder wiring guide |
| [docs/GPT_INSTRUCTIONS.md](./GPT_INSTRUCTIONS.md) | GPT operating policy seed |
| [docs/OPENCLAW_APS_ACTIVATION.md](./OPENCLAW_APS_ACTIVATION.md) | Current OpenClaw-to-APS activation path |
| [docs/OPENCLAW_OPENWEBUI_SETUP.md](./OPENCLAW_OPENWEBUI_SETUP.md) | VM/operator UI setup pattern |
| [docs/DEPLOY_LOCAL_VM.md](./DEPLOY_LOCAL_VM.md) | Local APS-on-VM mode |
| [docs/CHATGPT_OPENCLAW_APS_WIRING_BLUEPRINT.md](./CHATGPT_OPENCLAW_APS_WIRING_BLUEPRINT.md) | Supporting architecture reference for the target async wiring |
| [legacy/sql/memory-schema.sql](../legacy/sql/memory-schema.sql) | Historical precursor for memory tables; not active on the main path |

## Acceptance Criteria For This Spec

A reader who has never seen this repo should be able to use this document plus the referenced files to answer:

- what Founderos is,
- what parts are implemented now,
- what the target system is,
- where each key belongs,
- how to rebuild the system,
- how ChatGPT, APS, OpenClaw, Supabase, and GitHub are connected,
- what the memory/state kernel is,
- how the system may and may not improve itself.
