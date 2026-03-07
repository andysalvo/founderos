# Decision Ledger

Status: bootstrap shared-state object

This document defines the first tiny shared state object for Founderos: the decision ledger.

The goal is not to build a full memory system yet.
The goal is to give Founderos one durable object it can reason over for both self-improvement and real work.

## Why decisions first

Decisions are the smallest high-leverage object that connects:

- repo improvements
- product direction
- founder priorities
- tradeoffs
- rationale
- follow-up work

A decision is more reusable than a chat turn and less sprawling than a full memory platform.

## Bootstrap implementation

Until Founderos has a first-class Supabase-native decisions object, the bootstrap ledger lives in the repo at:

- `memory/decisions/`

This works with the current APS surface because Founderos can already:

- inspect repo trees with `repoTree`
- read individual files with `repoFile`
- reason over documents and markdown
- improve the schema and workflow later by PR

That makes the bootstrap decision ledger immediately usable without widening the active API surface.

## Decision object shape

Each decision entry should be a markdown file with these sections:

- `Decision ID`
- `Status`
- `Date`
- `Domain`
- `Summary`
- `Context`
- `Options considered`
- `Decision`
- `Rationale`
- `Consequences`
- `Follow-up`
- `Related objects`

This is intentionally simple.
The point is legibility first, automation second.

## Status values

Use one of:

- `proposed`
- `active`
- `superseded`
- `abandoned`

## Domain values

Examples:

- `founderos`
- `product`
- `operations`
- `finance`
- `marketing`
- `infrastructure`

## Operating rule

Founderos should be able to reason over decisions the same way it reasons over repo docs:

- inspect the ledger
- understand what has already been decided
- avoid repeating settled decisions
- connect new plans to prior rationale
- propose new decisions when a real tradeoff exists

This creates one shared reasoning substrate for improving Founderos and using Founderos.

## Naming convention

Files should follow this pattern:

- `YYYY-MM-DD-short-slug.md`

Example:

- `2026-03-06-unified-reasoning-with-one-system.md`

## Boundaries

The decision ledger is not:

- a secret store
- a freeform scratchpad
- an execution log
- a replacement for witness events
- a replacement for the future cognitive memory kernel

It is a small durable object for reasoning.

## Why this is the right first shared object

This is the smallest coherent bridge between:

- "how should Founderos improve itself?"
- "how should Founderos help the operator right now?"

Both questions often reduce to the same thing:
what decision has already been made, what decision is pending, and what follows from it.

## Next step after this

Once the repo-backed decision ledger proves useful, the next bounded upgrade is:

- add a first-class `decisions` object in the Supabase state model
- preserve provenance and status
- keep the same conceptual shape
- add bounded retrieval over decisions through APS

That is how Founderos grows one mind without pretending memory is solved all at once.
