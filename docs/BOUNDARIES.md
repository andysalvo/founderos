# Boundaries And Non-Goals

## Protected boundaries

- Auth boundary: authenticated routes require the Founderos write key with server-side secret validation. The canonical header is `x-founderos-key`; `Authorization: Bearer <key>` is tolerated only as a compatibility fallback for the same secret.
- Protected path policy: `commit.execute` rejects writes to `api/founderos/**`, `docs/openapi.founderos.yaml`, `.env*`, `.github/workflows/**`, and `vercel.json`.
- Witness invariant: `commit.execute` fails closed unless it can append a witness record before GitHub writes begin.
- Explicit authorization: `commit.execute` requires an authorization object and rejects any write set whose hash does not match the authorized hash.
- Server-side secret handling: GitHub App and Supabase credentials stay server-side only.

## Non-goals for v1

- No MCP surface on the active deploy path.
- No memory read/write endpoints.
- No agent inspect/improve wrappers.
- No OpenClaw integration beyond documentation notes in `legacy/`.
- No autonomous self-updating behavior.
- No general-purpose agent platform features.

## Future extensions

- Persist plan artifacts server-side and verify `plan_artifact_hash` against stored bytes.
- Add a read-only witness query endpoint if operationally necessary.
- Add stronger scope binding between `precommit.plan` artifacts and `commit.execute`.
