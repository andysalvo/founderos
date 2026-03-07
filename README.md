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
- `POST /api/founderos/orchestrate/submit`
- `GET /api/founderos/orchestrate/jobs/{job_id}`

The canonical schema is [`docs/openapi.founderos.yaml`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/openapi.founderos.yaml).

## Architecture

- Founderos is the broader system: ChatGPT as interface, APS as policy layer, OpenClaw as private worker habitat, Supabase as state spine, and GitHub as code spine.
- `precommit/plan` is proposal-only. It can summarize and shape intent, but it does not write files or call external systems.
- `capabilities` is public and read-only so GPT sessions can inspect the active contract before authenticated calls begin.
- `repo/file` and `repo/tree` read live GitHub state from allowlisted repos through server-side GitHub App auth.
- `commit/freeze-write-set` persists one exact canonical write set server-side so the safer freeze -> execute path can be used for larger or more exact governed changes.
- `commit/execute` is the only durable-write path. It is mechanical, hash-bound, and requires explicit authorization.
- `orchestrate/submit` and `orchestrate/jobs/{job_id}` provide the public async lane for longer-running worker tasks.
- Worker jobs now return structured inspection results plus a bounded proposal scaffold that can be reviewed and promoted into an exact write set.
- Witness logging happens before GitHub writes begin. If witness recording is unavailable, execution fails closed.
- GitHub App and Supabase credentials remain server-side.
- OpenClaw on the VM can now autonomously claim async jobs, inspect the repo, and return structured results through APS.

## Deployment and setup

- Master system spec: [`docs/FOUNDEROS_SYSTEM_SPEC.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/FOUNDEROS_SYSTEM_SPEC.md)
- Vercel deployment guide: [`docs/DEPLOY_VERCEL.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/DEPLOY_VERCEL.md)
- OpenClaw + OpenWebUI + APS setup guide: [`docs/OPENCLAW_OPENWEBUI_SETUP.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/OPENCLAW_OPENWEBUI_SETUP.md)
- OpenClaw APS activation: [`docs/OPENCLAW_APS_ACTIVATION.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/OPENCLAW_APS_ACTIVATION.md)
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
