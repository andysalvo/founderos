# OpenClaw APS Activation

This is the live persistent setup for the current Founderos async worker path:

- OpenClaw stays on the droplet as the private worker habitat.
- ChatGPT remains the public conversational interface.
- APS stays on Vercel as the public control plane and authority boundary.
- OpenClaw uses `FOUNDEROS_PUBLIC_WRITE_KEY` when available, or the transitional `FOUNDEROS_WRITE_KEY`, for public APS reads and submits when needed.
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
- `FOUNDEROS_PUBLIC_WRITE_KEY` or `FOUNDEROS_WRITE_KEY`
- `FOUNDEROS_WORKER_KEY`
- `FOUNDEROS_WORKER_ID`

Recommended values:

- `FOUNDEROS_BASE_URL=https://founderos-alpha.vercel.app`
- `FOUNDEROS_PUBLIC_WRITE_KEY=<preferred public/user APS key configured in Vercel>`
- `FOUNDEROS_WRITE_KEY=<optional compatibility fallback during migration>`
- `FOUNDEROS_WORKER_KEY=<worker-only key configured in Vercel>`
- `FOUNDEROS_WORKER_ID=openclaw-vm`

## Droplet setup

Create a small env file on the droplet:

```bash
mkdir -p /root/.config/founderos
cat >/root/.config/founderos/aps.env <<EOF
FOUNDEROS_BASE_URL=https://founderos-alpha.vercel.app
FOUNDEROS_PUBLIC_WRITE_KEY=REPLACE_ME
FOUNDEROS_WRITE_KEY=REPLACE_ME
FOUNDEROS_WORKER_KEY=REPLACE_ME
FOUNDEROS_WORKER_ID=openclaw-vm
EOF
chmod 600 /root/.config/founderos/aps.env
```

## Helper scripts

This repo includes helpers at:

- [`services/openclaw/aps-client.sh`](/Users/andysalvo_1/Documents/GitHub/founderos/services/openclaw/aps-client.sh)
- [`services/openclaw/check-worker.sh`](/Users/andysalvo_1/Documents/GitHub/founderos/services/openclaw/check-worker.sh)
- [`services/openclaw/extract-candidate-write-set.sh`](/Users/andysalvo_1/Documents/GitHub/founderos/services/openclaw/extract-candidate-write-set.sh)
- [`services/openclaw/freeze-candidate.sh`](/Users/andysalvo_1/Documents/GitHub/founderos/services/openclaw/freeze-candidate.sh)
- [`services/openclaw/decompose-project.sh`](/Users/andysalvo_1/Documents/GitHub/founderos/services/openclaw/decompose-project.sh)
- [`services/openclaw/submit-track.sh`](/Users/andysalvo_1/Documents/GitHub/founderos/services/openclaw/submit-track.sh)

`aps-client.sh` supports:

- `capabilities`
- `plan`
- `repo-file`
- `repo-tree`
- `freeze`
- `execute`
- `merge-pr`
- `submit`
- `job-status`
- `claim`
- `heartbeat`
- `complete`
- `fail`

The helper scripts support:

- extracting an exact worker `candidate_write_set` from a completed job,
- freezing that exact candidate into a governed APS write-set artifact when the candidate already includes exact file content,
- decomposing a broad project objective into deterministic bounded engineering tracks,
- and submitting one bounded track at a time through APS.

This keeps APS as the authority boundary while making it much faster to promote low-risk worker output and break broad work into reviewable execution lanes.

## Primary run model: systemd

Use `systemd` as the primary way to run the worker.
Do not treat `nohup` as the normal persistence model.

Service scaffold in the repo:

- [`ops/openclaw/systemd/founderos-worker.service.example`](/Users/andysalvo_1/Documents/GitHub/founderos/ops/openclaw/systemd/founderos-worker.service.example)

Install flow on the droplet:

```bash
cd /root/.openclaw/workspace/founderos
install -m 644 ops/openclaw/systemd/founderos-worker.service.example /etc/systemd/system/founderos-worker.service
systemctl daemon-reload
systemctl enable --now founderos-worker.service
systemctl status --no-pager founderos-worker.service
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

Worker doctor check:

```bash
bash services/openclaw/check-worker.sh /root/.config/founderos/aps.env
```

Async job verification:

1. Submit a job through `orchestrate/submit`.
2. Wait for the worker loop to claim it.
3. Poll `orchestrate/jobs/{job_id}` for durable status and result.

Promotion helper verification:

```bash
bash services/openclaw/extract-candidate-write-set.sh <job_id>
bash services/openclaw/freeze-candidate.sh <job_id> <frozen_by>
```

If the worker candidate is intent-only and does not contain exact file contents yet, the freeze helper will fail closed instead of widening authority implicitly.

Project track decomposition verification:

```bash
bash services/openclaw/decompose-project.sh "Build a workflow visibility surface for Founderos" /tmp/project-plan.json
cat /tmp/project-plan.json
bash services/openclaw/submit-track.sh /tmp/project-plan.json track-1
```

This flow is intentionally one-track-at-a-time. It creates reviewable bounded lanes without pretending a true swarm scheduler already exists.

## Recovery

Fast restart path on the VM:

```bash
cd /root/.openclaw/workspace/founderos
systemctl restart founderos-worker.service
systemctl status --no-pager founderos-worker.service
journalctl -u founderos-worker.service -n 50 --no-pager
bash services/openclaw/check-worker.sh /root/.config/founderos/aps.env
```

If the service is not installed yet, do the install flow first and then run the worker doctor check.

Emergency fallback only:

```bash
cd /root/.openclaw/workspace/founderos
set -a
source /root/.config/founderos/aps.env
set +a
nohup bash services/openclaw/worker-loop.sh >/root/founderos-worker.log 2>&1 &
```

That fallback is for temporary recovery only. Move back to `systemd` after the immediate incident is resolved.

## How execution stays safe

- APS checks the repo allowlist.
- APS rejects protected paths.
- APS classifies policy-bearing artifacts explicitly.
- Durable writes still require governed APS execution.
- APS will only merge a PR through the narrow squash-only merge lane after explicit authorization and green GitHub checks.
- Autonomous changes should end in reviewable PRs rather than direct pushes to `main`.

## Daily operating model

Use Founderos like this:

1. Submit a bounded async job from ChatGPT through public APS.
2. Let OpenClaw claim and inspect privately on the VM.
3. Review the returned proposal or write set.
4. If the worker returned an exact candidate, promote it through the helper path into a governed artifact.
5. If the work is broad, decompose it into bounded tracks and submit one track at a time.
6. Approve the resulting PR through GitHub when the change is acceptable.

That is the current safe path from chat intent to bounded self-improvement.
