# Projects

This directory is the lightweight home for project-scoped work in Founderos.

The system uses only two work scopes:

- repo scope
- project scope

This directory exists for the second of those scopes.

## Structure rule

Keep project structure shallow.

A project should have one top-level project directory and should not introduce deep nested subprojects unless a later governance change clearly justifies it.

The point is not to build a project-management maze.
The point is to give bounded work a clear home.

## Recommended pattern

Use one folder per active project:

- `projects/<project-name>/`

Inside that project folder, keep only what is needed to make the work legible.

Typical contents might include:

- a project README
- a brief or spec
- notes on current status
- links to related repo paths
- decisions relevant to the project

## Active examples

- `projects/openclaw-outputs-ledger/` — curated mirror of important OpenClaw outputs keyed by `job_id` and backed by canonical Supabase orchestration records
- `projects/paper-trading-loop/` — the active monetization project: a bounded paper-first crypto spot operator with an explicit no-live-money starting boundary and a human-authorized live-order north star

## Project portfolio discipline

Founderos should not spawn many parallel monetization projects by default.

The current rule is:

- keep one primary money-path project active at a time unless a later repo decision explicitly broadens the portfolio
- treat Founderos itself as the control plane, not as the end-user product by default
- use projects to prove one bounded money loop end to end before adding new commercialization ideas

## Communication rule

When Founderos is operating inside one of these project contexts, project-related messages should begin with the active project name in bold.

Outside project scope, communication should remain normal.
