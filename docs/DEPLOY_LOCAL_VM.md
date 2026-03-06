# Deploy APS Locally On A VM

This runs the active Founderos APS API on the same VM as OpenClaw instead of Vercel.

## Why use this mode

- Secrets stay local on the VM.
- OpenClaw still gets only one narrow APS key.
- GitHub and Supabase credentials stay behind APS.
- You remove Vercel from the request path.

## Required env vars on the VM

Create `/root/.config/founderos/local-aps.env`:

```bash
mkdir -p /root/.config/founderos
cat >/root/.config/founderos/local-aps.env <<'EOF'
FOUNDEROS_HOST=127.0.0.1
FOUNDEROS_PORT=8787
FOUNDEROS_WRITE_KEY=REPLACE_ME
ALLOWED_REPOS=andysalvo/founderos
GITHUB_APP_ID=REPLACE_ME
GITHUB_INSTALLATION_ID=REPLACE_ME
GITHUB_APP_PRIVATE_KEY=REPLACE_ME
SUPABASE_URL=REPLACE_ME
SUPABASE_SERVICE_ROLE_KEY=REPLACE_ME
EOF
chmod 600 /root/.config/founderos/local-aps.env
```

For `GITHUB_APP_PRIVATE_KEY`, preserve literal newlines or use escaped `\n`.

## Start the local APS server

From a clone of this repo on the VM:

```bash
cd /root/.openclaw/workspace/founderos
set -a
source /root/.config/founderos/local-aps.env
set +a
npm run start:local-aps
```

Default bind address:

- `http://127.0.0.1:8787`

## Point OpenClaw at local APS

Create `/root/.config/founderos/aps.env`:

```bash
cat >/root/.config/founderos/aps.env <<'EOF'
FOUNDEROS_BASE_URL=http://127.0.0.1:8787
FOUNDEROS_WRITE_KEY=REPLACE_ME
EOF
chmod 600 /root/.config/founderos/aps.env
```

Create `/usr/local/bin/aps`:

```bash
cat >/usr/local/bin/aps <<'EOF'
#!/usr/bin/env bash
set -a
source /root/.config/founderos/aps.env
set +a
exec /root/.config/founderos/bin/aps-client.sh "$@"
EOF
chmod +x /usr/local/bin/aps
```

## Smoke test

```bash
aps capabilities | jq '.ok'
aps repo-tree andysalvo/founderos main docs 10 | jq '.ok'
aps repo-file andysalvo/founderos docs/OPENCLAW_APS_ACTIVATION.md main | jq '.ok'
```

All three should return `true`.
