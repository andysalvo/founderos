# GPT Builder Setup

## What to import

Use the canonical schema at [`docs/openapi.founderos.yaml`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/openapi.founderos.yaml).

Before pasting it into GPT Builder, replace:

- `https://YOUR-PROJECT.vercel.app`

with your actual production base URL.

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
