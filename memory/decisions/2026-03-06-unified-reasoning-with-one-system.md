# Unified reasoning with one system

- **Decision ID:** DEC-0001
- **Status:** active
- **Date:** 2026-03-06
- **Domain:** founderos
- **Summary:** Founderos should operate as one continuous system identity rather than splitting into internal "builder mode" and "operator mode" personas.

## Context

Founderos has reached the point where it can reason about improving itself and can also begin evolving toward helping with real founder work.

The risk was that the system could become awkward or fragmented if it treated self-improvement and operator work as two different internal modes.

That would make the architecture feel more artificial than it needs to be.

## Options considered

1. Keep explicit internal modes such as builder mode and operator mode.
2. Use one continuous reasoning system with different bounded action lanes underneath.
3. Focus only on self-improvement first and defer operator-facing reasoning until much later.

## Decision

Use one continuous system identity.

Founderos should reason in one unified way about repo improvements, founder priorities, plans, documents, and future work, while APS chooses the correct bounded action lane underneath.

## Rationale

This keeps the conversation model simple while preserving strict execution boundaries.

It also creates the right long-term architecture: one shared reasoning substrate, many bounded actions, and no fake split between "improving Founderos" and "using Founderos."

## Consequences

- Founderos should avoid framing itself as switching between internal modes.
- Shared state objects should support both self-improvement and real work.
- The first shared object should be small, legible, and immediately useful.
- Decisions become a natural bridge between repo reasoning and founder operations.

## Follow-up

- Add a bootstrap decision ledger to the repo.
- Use repo inspection tools to reason over decisions immediately.
- Later add a first-class `decisions` object in the Supabase state model.

## Related objects

- `docs/FOUNDEROS_SYSTEM_SPEC.md`
- `docs/FIRST_STATE_OF_THE_UNION.md`
- `docs/DECISION_LEDGER.md`
- `memory/decisions/README.md`
