# Vercel Deployment

This repo deploys as a minimal Node/Vercel function set from the root `api/` directory.

## Active deploy surface

- `GET /api/founderos/health`
- `GET /api/founderos/capabilities`
- `POST /api/founderos/precommit/plan`
- `POST /api/founderos/commit/execute`

## Required environment variables

- `FOUNDEROS_WRITE_KEY`
  Shared API key expected in the `x-founderos-key` header for every authenticated route.
- `ALLOWED_REPOS`
  Comma-separated GitHub repos allowed for `commit.execute`, for example `owner/repo,owner/repo-two`.
- `GITHUB_APP_ID`
  GitHub App id used to mint installation tokens server-side.
- `GITHUB_INSTALLATION_ID`
  Installation id for the GitHub App in the target repo.
- `GITHUB_APP_PRIVATE_KEY`
  GitHub App private key PEM. Preserve newlines or use escaped `\n`.
- `SUPABASE_URL`
  Supabase project URL used for append-only witness writes.
- `SUPABASE_SERVICE_ROLE_KEY`
  Supabase service-role key used only on the server for witness writes.

## Required Supabase schema

Apply [`infra/supabase/witness_events.sql`](/Users/andysalvo_1/Documents/GitHub/founderos/infra/supabase/witness_events.sql) before using `commit.execute`.

## Deploy steps

1. Create a Vercel project from this repo.
2. Add all required environment variables in Vercel for Production and Preview as needed.
3. Deploy the repo without enabling any extra framework preset. The root `api/` folder is the runtime surface.
4. After deployment, verify:
   - `GET https://YOUR-DOMAIN/api/founderos/health`
   - `GET https://YOUR-DOMAIN/api/founderos/capabilities` with `x-founderos-key`
5. Keep the canonical schema at [`docs/openapi.founderos.yaml`](/Users/andysalvo_1/Documents/GitHub/founderos/docs/openapi.founderos.yaml) synchronized with the deployed code. The contract test covers this locally and in CI.

GPT Builder reachability note:
- Use a public production domain for GPT Actions.
- Do not use a Vercel preview or deployment URL if it is protected by Vercel Authentication or other Deployment Protection, because GPT Actions will receive the Vercel login page instead of your JSON API.
