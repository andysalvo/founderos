# Boundaries And Non-Goals

## Protected boundaries

- Auth boundary: `POST /api/founderos/capabilities/check`, `POST /api/founderos/precommit/plan`, `POST /api/founderos/commit/execute`, `POST /api/founderos/commit/merge-pr`, `POST /api/founderos/orchestrate/submit`, `GET /api/founderos/orchestrate/jobs/{job_id}`, `GET /api/founderos/trading/candidates`, `GET /api/founderos/trading/candidates/{candidate_id}`, `POST /api/founderos/trading/candidates/{candidate_id}/decision`, `GET /api/founderos/trading/journal`, `GET /api/founderos/trading/backtests/{run_id}`, and `GET /api/founderos/trading/connectors/health` require the public APS key with server-side secret validation. `FOUNDEROS_PUBLIC_WRITE_KEY` is preferred; `FOUNDEROS_WRITE_KEY` remains a compatibility fallback for the same public lane. The canonical header is `x-founderos-key`; `Authorization: Bearer <key>` is tolerated only as a compatibility fallback for the same secret. `GET /api/founderos/capabilities` is intentionally public and read-only.
- Lane separation boundary: public/user traffic and worker traffic use different secrets. Worker-only orchestration and auto-execute routes require `FOUNDEROS_WORKER_KEY`.
- Protected path policy: governed durable writes reject protected policy-bearing artifacts including `api/founderos/**`, `api/_lib/**`, `docs/openapi.founderos.yaml`, `docs/GPT_INSTRUCTIONS.md`, `docs/BOUNDARIES.md`, `docs/FOUNDEROS_SYSTEM_SPEC.md`, `docs/GPT_BUILDER_SETUP.md`, `infra/supabase/**`, `.env*`, `.github/workflows/**`, and `vercel.json`.
- Policy-bearing artifact rule: some artifacts are governance-bearing even when not auto-blocked. `memory/decisions/**`, `services/openclaw/**`, and `docs/FOUNDEROS_LIVE_STATE.md` must be treated as review-bearing policy content rather than ordinary documentation.
- Witness invariant: `commit.execute` fails closed unless it can append a witness record before GitHub writes begin.
- Merge invariant: `commit/merge-pr` is a separate narrow lane. It is allowlisted-repo only, explicit-authorization only, squash-only, protected-branch only, and it refuses to merge unless GitHub checks are green.
- Explicit authorization: `commit.execute` requires an authorization object and rejects any write set whose hash does not match the authorized hash.
- Deterministic translation invariant: raw model text must never directly become shell, Git, SQL, or mutating external API input. APS only permits structured, validated payloads to cross those boundaries.
- Server-side secret handling: GitHub App and Supabase credentials stay server-side only.
- Financial connector boundary: broker credentials, market-data credentials, kill switches, live-mode toggles, and risk envelopes stay in APS-owned adapters and governed state. The VM may inspect, backtest, shadow-scan, and recommend, but it does not become the money-moving authority boundary.

## Non-goals for v1

- No MCP surface on the active deploy path.
- No memory read/write endpoints.
- No agent inspect/improve wrappers.
- No OpenClaw integration beyond documentation notes in `legacy/`.
- No autonomous self-updating behavior.
- No autonomous PR merge behavior.
- No autonomous live trading on the active path without the later amendments, connector admission, risk policy, and live-authority state.
- No general-purpose agent platform features.

## Future extensions

- Persist plan artifacts server-side and verify `plan_artifact_hash` against stored bytes.
- Add a read-only witness query endpoint if operationally necessary.
- Add stronger scope binding between `precommit.plan` artifacts and `commit.execute`.
- Admit additional broker or market-data adapters only through the APS connector contract and governance path.
