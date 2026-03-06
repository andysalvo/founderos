# Founderos APS v1

Minimal APS-aligned control plane for Vercel and Custom GPT Actions.

## Active surface

- `GET /api/founderos/health`
- `GET /api/founderos/capabilities`
- `POST /api/founderos/capabilities/check`
- `POST /api/founderos/precommit/plan`
- `POST /api/founderos/commit/execute`

The canonical schema is [`docs/openapi.founderos.yaml`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/openapi.founderos.yaml).

## Architecture

- `precommit/plan` is proposal-only. It can summarize and shape intent, but it does not write files or call external systems.
- `capabilities` is public and read-only so GPT sessions can inspect the active contract before authenticated calls begin.
- `commit/execute` is the only durable-write path. It is mechanical, hash-bound, and requires explicit authorization.
- Witness logging happens before GitHub writes begin. If witness recording is unavailable, execution fails closed.
- GitHub App and Supabase credentials remain server-side.

## Deployment and setup

- Vercel deployment guide: [`docs/DEPLOY_VERCEL.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/DEPLOY_VERCEL.md)
- OpenClaw + OpenWebUI + APS setup guide: [`docs/OPENCLAW_OPENWEBUI_SETUP.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/OPENCLAW_OPENWEBUI_SETUP.md)
- OpenClaw APS activation: [`docs/OPENCLAW_APS_ACTIVATION.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/OPENCLAW_APS_ACTIVATION.md)
- GPT Builder setup: [`docs/GPT_BUILDER_SETUP.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/GPT_BUILDER_SETUP.md)
- Protected paths, non-goals, future extensions: [`docs/BOUNDARIES.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/BOUNDARIES.md)

## Legacy isolation

Older wrapper, MCP, memory, and duplicate artifacts were moved under [`legacy/`](/Users/andysalvo_1/Documents/GitHub/founderos/legacy) so they no longer sit on the active v1 path.

## Verification

Run:

```bash
npm test
```
