# Founderos

Private founder operating system with a verified APS control-plane seed and a live async worker loop.

## Governance

Founderos is not fully legible from the product description, API surface, worker wiring, or deployment docs alone.

To understand what Founderos is, how its powers are bounded, how OpenClaw tooling may be added safely over time, and how the system is intended to grow into a broader agentic workflow standard, read the governance corpus before widening agency:

- `docs/governance/README.md`
- `docs/governance/PRE_CONSTITUTION_RESEARCH_CORPUS.md`
- `docs/governance/CONSTITUTION.md`
- `docs/governance/amendments/README.md`
- active amendments in `docs/governance/amendments/`
- relevant governance decisions in `memory/decisions/`

This governance layer should be treated as required reading before adding OpenClaw tools, broadening execution autonomy, or interpreting Founderos as a general autonomous agent.

## Work scopes

Founderos now formalizes only two work scopes:

- **Repo scope** — the default scope for ordinary conversation, planning, inspection, and whole-repo work
- **Project scope** — the only narrower scope beneath repo work, used when a bounded project is explicitly active

New threads should begin in ordinary conversation at repo scope by default.
Project-scoped communication should clearly signal the active project name at the beginning of project-related messages.

For the stable public rule, read:

- `docs/principles/project-scope.md`
- `docs/governance/amendments/AMENDMENT_004_PROJECT_SCOPE_AND_CONTEXT_SIGNALING.md`
- `projects/README.md`

First read: [docs/FOUNDEROS_SYSTEM_SPEC.md](/Users/andysalvo_1/Documents/GitHub/founderos/docs/FOUNDEROS_SYSTEM_SPEC.md)

Current live snapshot: [docs/FOUNDEROS_LIVE_STATE.md](/Users/andysalvo_1/Documents/GitHub/founderos/docs/FOUNDEROS_LIVE_STATE.md)

## Core Principles

- The founder remains the decision-maker.
- AI may propose, structure, and support execution.
- Irreversible actions must remain attributable to the human.
- Execution should be bounded, explicit, and inspectable.

Public principles and authority-model docs live in [docs/principles/](/Users/andysalvo_1/Documents/GitHub/founderos/docs/principles/README.md).

## Active surface

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

The canonical schema is [`docs/openapi.founderos.yaml`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/openapi.founderos.yaml).

## Architecture

- Founderos is the broader system: ChatGPT as interface, APS as policy layer, OpenClaw as private worker habitat, Supabase as state spine, and GitHub as code spine.
- `precommit/plan` is proposal-only. It can summarize and shape intent, but it does not write files or call external systems.
- `capabilities` is public and read-only so GPT sessions can inspect the active contract before authenticated calls begin.
- `repo/file` and `repo/tree` read live GitHub state from allowlisted repos through server-side GitHub App auth.
- `commit/execute` is the only durable-write path. It is mechanical, hash-bound, and requires explicit authorization.
- `commit/merge-pr` is a separate narrow authority path: allowlisted repo only, explicit authorization only, squash-only, protected-branch only, and blocked unless checks are green.
- `orchestrate/submit` and `orchestrate/jobs/{job_id}` provide the public async lane for longer-running worker tasks.
- APS-owned trading routes expose candidate review, journal reads, backtest reads, and connector readiness without moving broker authority onto the VM.
- Policy-bearing artifacts are classified explicitly. Protected control-plane and provenance artifacts are blocked from governed durable writes, and review-required policy artifacts are surfaced as governance-bearing rather than ordinary content.
- Raw model text is not treated as executable authority. Shell, Git, SQL, and mutating GitHub inputs must arrive as structured payloads that pass deterministic validation first.
- Witness logging happens before GitHub writes begin. If witness recording is unavailable, execution fails closed.
- GitHub App and Supabase credentials remain server-side.
- OpenClaw on the VM can autonomously claim async jobs, inspect the repo, and return structured results through APS with worker runtime commit attribution in heartbeat and completion payloads.
- Worker jobs now support project-aware trading lanes so `paper-trading-loop` tracks load their anchors before proposing research, backtest, shadow-scan, execution, or sync work.

## Monetization framing

Founderos should be treated as a **control plane for bounded money loops**, not as a broad consumer product by default.

That means the repo is optimized for:

- orchestration
- approvals
- durable logs
- worker execution
- reviewable bounded actions

The current monetization path is intentionally narrow:

- first prove a disciplined **paper-first crypto spot trading operator**
- then, only if the paper loop is legible and stable, progress to **human-authorized live trade staging**
- do not widen into a generic trading bot, generic AI SaaS, or random marketplace experiments without a separate explicit project decision

The active project for this path lives under:

- `projects/paper-trading-loop/`

## Deployment and setup

- Master system spec: [`docs/FOUNDEROS_SYSTEM_SPEC.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/FOUNDEROS_SYSTEM_SPEC.md)
- Vercel deployment guide: [`docs/DEPLOY_VERCEL.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/DEPLOY_VERCEL.md)
- OpenClaw + OpenWebUI + APS setup guide: [`docs/OPENCLAW_OPENWEBUI_SETUP.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/OPENCLAW_OPENWEBUI_SETUP.md)
- OpenClaw APS activation: [`docs/OPENCLAW_APS_ACTIVATION.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/OPENCLAW_APS_ACTIVATION.md)
- OpenClaw VM hardening baseline: [`docs/OPENCLAW_VM_HARDENING_BASELINE.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/OPENCLAW_VM_HARDENING_BASELINE.md)
- GPT Builder setup: [`docs/GPT_BUILDER_SETUP.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/GPT_BUILDER_SETUP.md)
- Target async wiring reference: [`docs/CHATGPT_OPENCLAW_APS_WIRING_BLUEPRINT.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/CHATGPT_OPENCLAW_APS_WIRING_BLUEPRINT.md)
- Protected paths, non-goals, future extensions: [`docs/BOUNDARIES.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/BOUNDARIES.md)

## Legacy isolation

Older wrapper, MCP, memory, and duplicate artifacts were moved under [`legacy/`](/Users/andysalvo_1/Documents/GitHub/founderos/legacy) so they no longer sit on the active v1 path.

## Verification

Run:

```bash
npm test
```
