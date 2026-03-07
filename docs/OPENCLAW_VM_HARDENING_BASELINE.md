# OpenClaw VM Hardening Baseline

Status: practical baseline and scaffolding, not a claim of live host enforcement

This document defines the minimum hardening baseline for the OpenClaw host.

It does not claim the live machine already satisfies every item.
It defines the baseline the operator should move toward.

## Core rule

Same box does not mean same trust zone.

If APS, OpenClaw, and operator tools share one VM, they still need explicit separation in secrets, services, ports, logs, and restart behavior.

## Secret placement rules

- Keep `GITHUB_APP_PRIVATE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in APS-only env files or server-side secret stores.
- Keep `FOUNDEROS_WORKER_KEY` only where the worker service actually needs it.
- Prefer `FOUNDEROS_PUBLIC_WRITE_KEY` for public/user APS traffic; keep `FOUNDEROS_WRITE_KEY` only as a transition fallback.
- Store VM env files under a root-owned directory such as `/root/.config/founderos/`.
- Require `chmod 600` on env files and never place secrets in repo-tracked files.

## Service separation expectations

- Run APS and the OpenClaw worker as separate services, even if both live on the same VM.
- Give each service its own env file and restart policy.
- Do not let OpenClaw read APS-only secrets just because the files are on the same disk.
- Treat operator shells, browser UIs, and background workers as separate trust lanes.

## Restart and persistence expectations

- Use a service manager such as `systemd` instead of ad hoc `nohup` for normal operation.
- Restart worker and APS services automatically on failure.
- Persist logs outside the repo worktree.
- Keep the repo clone disposable; keep state in Supabase and explicit operator-owned config/log locations.

Example worker service scaffold:

- [`ops/openclaw/systemd/founderos-worker.service.example`](/Users/andysalvo_1/Documents/GitHub/founderos/ops/openclaw/systemd/founderos-worker.service.example)

## Network exposure guidance

- Bind local APS to `127.0.0.1` when it is intended only for the worker on the same VM.
- Do not expose worker-only routes directly to the public internet.
- Put any operator UI behind separate auth and TLS.
- Minimize outbound egress from worker services to the exact providers they need.

## Logging expectations

- Keep append-only worker and APS service logs.
- Include worker id, job id, repo, and runtime commit SHA in operational logs when feasible.
- Do not log raw secrets, API keys, or provider tokens.
- Preserve enough log retention to reconcile witness rows with host-level failures.

## Backup and recovery expectations

- Treat Supabase as the durable witness spine and ensure its backup posture is understood.
- Back up operator-owned env files, unit files, and recovery notes separately from the repo clone.
- Document the procedure for rehydrating the VM from a fresh clone plus env files plus service units.

## Minimum operator checklist

- Separate APS-only secrets from worker-only secrets.
- Use separate service units for APS and worker processes.
- Keep APS local-only unless it is intentionally the public control plane.
- Verify worker heartbeat payloads include runtime commit attribution.
- Keep recovery docs and systemd units under version control, but keep live secrets out of the repo.
