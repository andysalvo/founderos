# GPT Builder Setup

## What to import

Use the canonical schema at [`docs/openapi.founderos.yaml`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/openapi.founderos.yaml).
It should point at a public production domain that GPT Actions can reach:

- `https://founderos-alpha.vercel.app`

## GPT Builder steps

1. Open ChatGPT `GPTs` and edit your GPT.
2. Open `Configure` -> `Actions`.
3. Paste the contents of [`docs/openapi.founderos.yaml`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/openapi.founderos.yaml).
4. Configure auth as API key auth.
5. Set header name to `x-founderos-key`.
6. Set the key value to `FOUNDEROS_PUBLIC_WRITE_KEY` when present, otherwise `FOUNDEROS_WRITE_KEY`.

## Suggested GPT instructions

Use the text in [`docs/GPT_INSTRUCTIONS.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/GPT_INSTRUCTIONS.md) as the starting point.

The intended GPT behavior is:

- inspect the repo first
- discuss what it found with the user
- use async orchestration only when the task needs longer-running execution
- report back durable job results and PR links when they exist

## Recommended action flow

### Read-first flow

Use this for most reasoning and discussion:

1. Call `capabilities` when needed to inspect the active contract.
2. Call `repoTree` to inspect repo structure.
3. Call `repoFile` to inspect specific files.
4. Call `precommitPlan` when a proposal artifact would help shape the next step.
5. Explain findings and recommendations to the user before escalating.

### Async execution flow

Use this when the request is broader or implementation-heavy:

1. Call `orchestrateSubmit`.
2. Tell the user that Founderos queued an async job.
3. Poll `orchestrateJobStatus`.
4. Summarize the returned result, proposal, or PR outcome for the user.

### Explicit write flow

Use this only when the user has approved the exact write set:

1. Present the exact write set clearly.
2. Confirm that the user wants that exact write set executed.
3. Call `commitExecute` only after explicit approval.
4. If the user later wants APS to merge the resulting PR, call `commitMergePr` only with the explicit PR number, expected head SHA, and base branch the user is authorizing.

## Current practical recommendation

For the current system, the best GPT behavior is:

- use synchronous APS reads for inspection and analysis
- use `orchestrateSubmit` for “figure out the next improvement and implement it” style requests
- prefer returning a PR link or durable job result instead of claiming vague autonomous success

## Troubleshooting

- `GET /api/founderos/capabilities` is public and should work before auth is attached in the session.
- Use `capabilitiesCheck` to verify GPT Builder is actually sending the API key on authenticated calls.
- Keep the Builder auth config as `x-founderos-key`.
- Founderos also tolerates `Authorization: Bearer <FOUNDEROS_PUBLIC_WRITE_KEY>` or `Authorization: Bearer <FOUNDEROS_WRITE_KEY>` as a compatibility fallback.
- Do not expose worker-only endpoints in GPT Builder.
- Do not point GPT Builder at a Vercel preview or deployment URL behind Vercel Authentication.
