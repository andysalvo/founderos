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
6. Set the key value to the exact `FOUNDEROS_WRITE_KEY` configured in Vercel.

## Suggested GPT instructions

Use the text in [`docs/GPT_INSTRUCTIONS.md`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/GPT_INSTRUCTIONS.md) as the starting point for the GPT’s instructions.

## Minimal action flow

1. Call `precommitPlan` to produce a proposal artifact.
2. Present the artifact to the human for review.
3. Only call `commitExecute` after the human has frozen the exact `write_set` and explicit authorization fields.

## Troubleshooting

- If `health` works but `capabilities` fails inside GPT Builder, delete and recreate the Action from the current schema.
- If `capabilities` still shows `auth_received_via: "none"`, test `capabilitiesCheck` next. It is the same protected contract check over `POST`.
- Keep the canonical Builder auth config as `x-founderos-key`.
- Founderos also tolerates `Authorization: Bearer <FOUNDEROS_WRITE_KEY>` as a compatibility fallback for GPT action transport of the same secret.
- Do not point GPT Builder at a Vercel preview or deployment URL that is behind Vercel Authentication. GPT Actions cannot complete that SSO flow and will fail with `ClientResponseError` before your handler runs.
