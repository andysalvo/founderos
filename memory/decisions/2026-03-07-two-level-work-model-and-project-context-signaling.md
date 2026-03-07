# Decision ID

TBD

## Status

proposed

## Date

2026-03-07

## Domain

founderos

## Summary

Formalize a two-level work model for Founderos: repo scope by default and project scope as the only narrower scope beneath it.

## Context

Founderos is moving from general system setup into real bounded project work. A simple scope model is needed so the system can stay aware of whether it is operating at the whole-repo level or within a specific project, without introducing a complex hierarchy of nested contexts.

## Options considered

1. leave scope informal and let project context emerge ad hoc
2. introduce many layers of work scope and nested project structure
3. formalize a two-level model with repo scope as default and project scope as the only narrower scope

## Decision

Adopt the two-level work model and require clear project-name signaling at the beginning of project-scoped messages.

## Rationale

This keeps normal conversation simple, keeps project work bounded, and gives both founder and system a stable way to remain aware of when they are operating inside a project.

## Consequences

- new threads should begin in normal repo-scope communication
- project work becomes easier to distinguish from whole-repo work
- Founderos gains a stable project context rule without deep nesting
- protected GPT instruction surfaces should later be aligned to this rule through a governed patch path

## Follow-up

- add a public principle document for project scope
- add a governance amendment for project scope and context signaling
- create lightweight project structure guidance
- prepare a proposed patch for protected GPT instructions

## Related objects

- `docs/principles/project-scope.md`
- `docs/governance/amendments/AMENDMENT_004_PROJECT_SCOPE_AND_CONTEXT_SIGNALING.md`
- `docs/GPT_INSTRUCTIONS_PROJECT_SCOPE_PROPOSED_PATCH.md`
- `projects/README.md`
