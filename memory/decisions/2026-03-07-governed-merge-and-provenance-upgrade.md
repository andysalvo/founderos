# Decision ID

2026-03-07-governed-merge-and-provenance-upgrade

## Status

active

## Date

2026-03-07

## Domain

founderos

## Summary

Add a narrow governed PR merge lane, classify policy-bearing artifacts explicitly, and strengthen provenance so Founderos can finish bounded code changes without weakening APS sovereignty.

## Context

Founderos could already open governed PRs, but it still stopped short of a narrowly governed merge path, stronger policy-artifact treatment, and runtime-aligned provenance between merged code and the worker VM.

## Options considered

- Keep stopping at PR creation only.
- Add a broad GitHub mutation surface.
- Add a narrow PR-merge-only APS route with explicit authorization, squash-only policy, green-check gating, branch-protection respect, and stronger witness/provenance rules.

## Decision

Choose the narrow PR-merge-only APS route and pair it with explicit policy-bearing artifact classification plus stronger public/worker lane attribution and runtime commit reporting.

## Rationale

This keeps sovereignty in governance, bounded execution, and witnessability rather than in model trust. It gives Founderos a practical path to finish bounded changes while preserving reviewability and future flexibility.

## Consequences

- APS can now merge allowlisted PRs under explicit narrow policy.
- Policy-bearing artifacts are no longer treated as ordinary content.
- Public/user and worker traffic are better separated without breaking `FOUNDEROS_WRITE_KEY` compatibility.
- Worker heartbeat and completion payloads can identify the exact running worker commit.
- Auto-merge remains intentionally non-automated.

## Follow-up

- Move public clients fully to `FOUNDEROS_PUBLIC_WRITE_KEY`.
- Add stronger subject identity once a lightweight identity layer exists.
- Decide later whether any review-required policy-bearing artifacts deserve narrower governed subpaths instead of full protection.

## Related objects

- [docs/FOUNDEROS_SYSTEM_SPEC.md](/Users/andysalvo_1/Documents/GitHub/founderos/docs/FOUNDEROS_SYSTEM_SPEC.md)
- [docs/BOUNDARIES.md](/Users/andysalvo_1/Documents/GitHub/founderos/docs/BOUNDARIES.md)
- [docs/OPENCLAW_VM_HARDENING_BASELINE.md](/Users/andysalvo_1/Documents/GitHub/founderos/docs/OPENCLAW_VM_HARDENING_BASELINE.md)
