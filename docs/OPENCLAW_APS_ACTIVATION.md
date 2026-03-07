# OpenClaw APS Activation

This is the live persistent setup for the current Founderos async worker path:

- OpenClaw stays on the droplet as the private worker habitat.
- ChatGPT remains the public conversational interface.
- APS stays on Vercel as the public control plane and authority boundary.
- OpenClaw uses `FOUNDEROS_WRITE_KEY` for public APS reads and submits when needed.
- OpenClaw uses `FOUNDEROS_WORKER_KEY` for worker-only orchestration claim, heartbeat, complete, and fail calls.

Do not give OpenClaw the GitHub App private key or Supabase service-role key directly.

## What this gives you

1. ChatGPT can submit async jobs through public APS.
2. OpenClaw can claim those jobs privately from the VM.
3. APS keeps auth, policy, witness logging, and GitHub write boundaries server-side.
4. The worker loop can keep running even when the laptop terminal is closed.

## VM env vars

OpenClaw on the droplet should have:

- `FOUNDEROS_BASE_URL`
- `FOUNDEROS_WRITE_KEY`
- `FOUNDEROS_WORKER_KEY`
- `FOUNDEROS_WORKER_ID`

Recommended values:

- `FOUNDEROS_BASE_URL=https://founderos-alpha.vercel.app`
- `FOUNDEROS_WRITE_KEY=<same value configured in Vercel for GPT/user APS auth>`
- `FOUNDEROS_WORKER_KEY=<worker-only key configured in Vercel>`
- `FOUNDEROS_WORKER_ID=openclaw-vm`

## Droplet setup

Create a small env file on the droplet:

```bash
mkdir -p /root/.config/founderos
cat >/root/.config/founderos/aps.env <<EOF
FOUNDEROS_BASE_URL=https://founderos-alpha.vercel.app
FOUNDEROS_WRITE_KEY=REPLACE_ME
FOUNDEROS_WORKER_KEY=REPLACE_ME
FOUNDEROS_WORKER_ID=openclaw-vm
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
- `submit`
- `job-status`
- `claim`
- `heartbeat`
- `complete`
- `fail`

## Worker loop startup

From the droplet clone of this repo:

```bash
cd /root/.openclaw/workspace/founderos
set -a
source /root/.config/founderos/aps.env
set +a
nohup bash services/openclaw/worker-loop.sh >/root/founderos-worker.log 2>&1 &
```

## Verification

Public APS auth check:

```bash
bash services/openclaw/aps-client.sh capabilities
```

Worker claim check:

```bash
bash services/openclaw/aps-client.sh claim
```

Async job verification:

1. Submit a job through `orchestrate/submit`.
2. Wait for the worker loop to claim it.
3. Poll `orchestrate/jobs/{job_id}` for durable status and result.

## How execution stays safe

- APS checks the repo allowlist.
- APS rejects protected paths.
- Durable writes still require governed APS execution.
- Autonomous changes should end in reviewable PRs rather than direct pushes to `main`.

## Daily operating model

Use Founderos like this:

1. Submit a bounded async job from ChatGPT through public APS.
2. Let OpenClaw claim and inspect privately on the VM.
3. Review the returned proposal or write set.
4. Approve the resulting PR through GitHub when the change is acceptable.

That is the current safe path from chat intent to bounded self-improvement.