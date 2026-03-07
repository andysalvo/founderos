# Decisions

This directory is the bootstrap decision ledger for Founderos.

Each file in this directory is a durable decision object that Founderos can inspect through the current APS repo-reading surface.

## Purpose

Use decision files to record:

- important founder decisions
- system architecture decisions
- self-improvement decisions
- tradeoffs that should influence future work

## File naming

Use:

- `YYYY-MM-DD-short-slug.md`

## Required sections

Each decision file should include:

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

## Status values

Use one of:

- `proposed`
- `active`
- `superseded`
- `abandoned`

## Rule of thumb

If Founderos should remember the rationale for a tradeoff later, it probably belongs here.
