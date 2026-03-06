# GPT Builder Setup

## What to import

Use the canonical schema at [`docs/openapi.founderos.yaml`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/openapi.founderos.yaml).
It already points at production:

- `https://founderos-5hj8l08i5-andysalvos-projects.vercel.app`

## GPT Builder steps

1. Open ChatGPT `GPTs` and edit your GPT.
2. Open `Configure` -> `Actions`.
3. Paste the contents of [`docs/openapi.founderos.yaml`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/openapi.founderos.yaml).
4. Configure auth as API key auth.
5. Set header name to `x-founderos-key`.
6. Set the key value to the exact `FOUNDEROS_WRITE_KEY` configured in Vercel.

## Suggested GPT instructions

Use the text in [`docs/GPT_INSTRUCTIONS.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/GPT_INSTRUCTIONS.md) as the starting point for the GPT’s instructions.

## Minimal action flow

1. Call `capabilities` first when the GPT is uncertain what operator inputs are still missing.
2. If `operator_inputs.missing_env` is non-empty, ask the founder to place those values in Vercel instead of guessing.
3. Call `openclawInspect` for analysis-only runtime support when deeper inspection is needed.
4. Call `precommitPlan` to produce a proposal artifact.
5. Present the artifact to the human for review.
6. Only call `commitExecute` after the human has frozen the exact `write_set` and explicit authorization fields.

GPT Builder still talks only to Founderos. It does not call OpenClaw directly.

## Troubleshooting

- If curl works but the GPT Action fails, delete and recreate the Action from the current schema.
- Reconfirm the Action auth header is exactly `x-founderos-key`.
- Reconfirm the Action API key exactly matches `FOUNDEROS_WRITE_KEY`.
- Founderos also accepts `Authorization: Bearer <FOUNDEROS_WRITE_KEY>` as a compatibility fallback for GPT action transport, but the canonical Builder config remains `x-founderos-key`.
