# Founderos

Private founder operating system with a verified APS control-plane seed and a live async worker loop.

First read: [docs/FOUNDEROS_SYSTEM_SPEC.md](/Users/andysalvo_1/Documents/GitHub/founderos/docs/FOUNDEROS_SYSTEM_SPEC.md)

Current live snapshot: [docs/FOUNDEROS_LIVE_STATE.md](/Users/andysalvo_1/Documents/GitHub/founderos/docs/FOUNDEROS_LIVE_STATE.md)

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

The canonical schema is [`docs/openapi.founderos.yaml`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/openapi.founderos.yaml).

## Architecture

- Founderos is the broader system: ChatGPT as interface, APS as policy layer, OpenClaw as private worker habitat, Supabase as state spine, and GitHub as code spine.
- `precommit/plan` is proposal-only. It can summarize and shape intent, but it does not write files or call external systems.
- `capabilities` is public and read-only so GPT sessions can inspect the active contract before authenticated calls begin.
- `repo/file` and `repo/tree` read live GitHub state from allowlisted repos through server-side GitHub App auth.
- `commit/execute` is the only durable-write path. It is mechanical, hash-bound, and requires explicit authorization.
- `commit/merge-pr` is a separate narrow authority path: allowlisted repo only, explicit authorization only, squash-only, protected-branch only, and blocked unless checks are green.
- `orchestrate/submit` and `orchestrate/jobs/{job_id}` provide the public async lane for longer-running worker tasks.
- Policy-bearing artifacts are classified explicitly. Protected control-plane and provenance artifacts are blocked from governed durable writes, and review-required policy artifacts are surfaced as governance-bearing rather than ordinary content.
- Raw model text is not treated as executable authority. Shell, Git, SQL, and mutating GitHub inputs must arrive as structured payloads that pass deterministic validation first.
- Witness logging happens before GitHub writes begin. If witness recording is unavailable, execution fails closed.
- GitHub App and Supabase credentials remain server-side.
- OpenClaw on the VM can now autonomously claim async jobs, inspect the repo, and return structured results through APS with worker runtime commit attribution in heartbeat and completion payloads.
- Worker jobs now return structured inspection results plus a dedicated bounded proposal block that can be reviewed and promoted into an exact write set.

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
