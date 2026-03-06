# OpenClaw APS Activation

This is the minimal persistent setup:

- OpenClaw stays on the droplet as the interface you talk to.
- GitHub stays the source of truth for the repo.
- APS stays on Vercel and holds the sensitive server-side secrets.
- OpenClaw gets one APS client key only: `FOUNDEROS_WRITE_KEY`.

Do not give OpenClaw the GitHub App private key or Supabase service-role key directly.

## What this gives you

1. OpenClaw can read the live GitHub repo for context through APS.
2. OpenClaw can call APS over HTTPS.
3. APS can plan, validate, and create PRs safely.
4. GitHub and Supabase secrets remain server-side in Vercel.

## One-secret rule

OpenClaw on the droplet should only need:

- `FOUNDEROS_BASE_URL`
- `FOUNDEROS_WRITE_KEY`

Recommended values:

- `FOUNDEROS_BASE_URL=https://founderos-alpha.vercel.app`
- `FOUNDEROS_WRITE_KEY=<same value already configured in Vercel>`

## Droplet setup

Create a small env file on the droplet:

```bash
mkdir -p /root/.config/founderos
cat >/root/.config/founderos/aps.env <<'EOF'
FOUNDEROS_BASE_URL=https://founderos-alpha.vercel.app
FOUNDEROS_WRITE_KEY=REPLACE_ME
EOF
chmod 600 /root/.config/founderos/aps.env
```

## Helper script

This repo includes a helper at:

- [`services/openclaw/aps-client.sh`](/Users/andysalvo_1/Documents/GitHub/founderos/services/openclaw/aps-client.sh)

It supports:

- `capabilities`
- `plan`
- `repo-file`
- `repo-tree`
- `execute`

Copy it to the droplet or run it from any path on the droplet. OpenClaw does not need a local repo clone for read context.

## First activation commands

From the droplet:

```bash
mkdir -p /root/.config/founderos/bin
cp /path/to/services/openclaw/aps-client.sh /root/.config/founderos/bin/aps-client.sh
chmod +x /root/.config/founderos/bin/aps-client.sh
source /root/.config/founderos/aps.env
/root/.config/founderos/bin/aps-client.sh capabilities
```

If that works, test live GitHub reads:

```bash
/root/.config/founderos/bin/aps-client.sh repo-tree owner/repo main docs 50
/root/.config/founderos/bin/aps-client.sh repo-file owner/repo docs/OPENCLAW_APS_ACTIVATION.md main
```

Then test planning:

```bash
/root/.config/founderos/bin/aps-client.sh plan "Inspect the live GitHub repo and propose the smallest next integration step for OpenClaw and APS."
```

## How execution stays safe

Execution is still bounded:

- APS checks the repo allowlist.
- APS rejects protected paths.
- APS requires an explicit authorized write-set hash.
- APS writes a witness record before GitHub writes begin.
- APS opens a PR instead of pushing directly to `main`.

## Persistence model

This gives you persistence without raw secret sprawl:

- OpenClaw persists sessions and local state on the droplet.
- GitHub persists code.
- APS persists authority and write audit behavior.
- Supabase persists witness events for APS writes.

## Daily operating model

Use OpenClaw like this:

1. Ask it to call APS `repo-tree` and `repo-file` against the target repo.
2. Ask it to call APS `capabilities` and `plan`.
3. Ask it to prepare an exact write set.
4. Only then use APS `execute` for PR creation.

That is the simplest safe self-improving loop in the current stack.
