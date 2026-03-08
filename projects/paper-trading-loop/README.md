# Paper Trading Loop

This project is the bounded home for building a paper-first trading operator inside Founderos.

## North star

Build Founderos into a human-authorized crypto spot trading system that automates research, signal generation, paper execution, risk checks, trade staging, journaling, and review, while requiring explicit approval for every live order.

## Current boundary

This project starts with **paper trading only**.

No live capital.
No live order routing.
No exchange keys with withdrawal or live trading permissions.

The long-term destination may widen later, but only through explicit governance and staged promotion gates.

## Why this exists

Founderos already has:

- APS as a control-plane and authority boundary
- OpenClaw as a private worker habitat
- Supabase as a durable ledger spine
- GitHub as a code and spec spine

That makes it a good fit for:

- research automation
- signal generation
- bounded simulated execution
- trade journaling
- post-trade review
- human-authorized live staging later

## Money-path framing

This project is not trying to reinvent a broad trading platform.

It exists to prove one monetizable operator loop that fits Founderos well:

1. the system does most of the repetitive work
2. the system produces staged, reviewable outputs
3. the founder authorizes irreversible real-money actions later

That is the narrow commercial thesis.
Founderos is the control plane for this loop, not the end-user trading product by default.

## First milestone

Prove a disciplined paper-trading loop works end to end:

1. market data or paper API is connected
2. one tiny strategy is defined
3. one journal schema is defined
4. every paper trade is logged
5. every trade can be reviewed against explicit risk rules

## Project files

- `authority-boundary.md`
- `exchange-choice.md`
- `paper-first-architecture.md`
- `risk-rules.md`
- `journal-schema.md`
- `first-strategy.md`
- `monetization-path.md`
- `what-not-to-build-yet.md`
- `trading-object-model.md`
- `research/trading-agent-research-notes.md`

## Success condition for phase 1

Founderos can generate and record paper trades in a bounded, reviewable, repeatable way without widening authority to live money movement.
