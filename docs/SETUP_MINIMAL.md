# SETUP (MINIMAL)

1. Get your Vercel base URL
- Open Vercel project `founderos` -> `Deployments`.
- Copy either:
  - your production custom domain (recommended), or
  - the production `.vercel.app` URL.
- Use it as `BASE_URL` (example: `https://founderos-alpha.vercel.app`).

2. Add Actions in GPT Builder
- Open ChatGPT -> `GPTs` -> your GPT -> `Configure` -> `Actions`.
- Click `Import from URL` or `Paste text`.
- Use `docs/openapi.founderos.yaml` and replace `servers.url` with your `BASE_URL`.
- Canonical GPT actions are:
  - `agentInspect` -> `POST /founderos/agent/inspect`
  - `agentImprove` -> `POST /founderos/agent/improve`

3. Configure auth for the Action
- In GPT Builder Action auth settings, use API Key auth.
- Header name: `x-founderos-key`
- Key value: paste the exact value of `FOUNDEROS_WRITE_KEY` (from Vercel env vars).

4. Quick endpoint checks with curl
```bash
BASE_URL="https://founderos-alpha.vercel.app"
KEY="YOUR_FOUNDEROS_WRITE_KEY"

# 1) Health (no auth)
curl -sS "$BASE_URL/api/founderos/health"

# 2) Memory write (auth required)
curl -sS -X POST "$BASE_URL/api/founderos/memory/write" \
  -H "content-type: application/json" \
  -H "x-founderos-key: $KEY" \
  -d '{"kind":"note","title":"test","body":"hello founderos","tags":["smoke"],"source":"curl"}'

# 3) Memory query (auth required)
curl -sS "$BASE_URL/api/founderos/memory/query?kind=note&q=hello&limit=20" \
  -H "x-founderos-key: $KEY"
```

5. Supabase manual step
- Apply `memory/schema.sql` in Supabase SQL Editor before using memory routes.

6. MCP endpoint (for future tool runtimes)
- FounderOS also exposes `POST /api/mcp` as a thin MCP adapter over existing FounderOS tools.
