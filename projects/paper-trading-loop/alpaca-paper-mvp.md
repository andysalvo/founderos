# Alpaca Paper MVP

## Purpose

This document defines the first real implementation target for the Paper Trading Loop project.

The goal is not to build a full trading platform.
The goal is to build the smallest end-to-end loop that proves Founderos can:

- read market data
- evaluate one tiny deterministic strategy
- create one trade candidate
- move that candidate through a simple approval state model
- execute a paper order through Alpaca
- log the result into a durable journal shape

This is the canonical MVP build target.

## Canonical scope

This MVP is:

- paper trading only
- one provider only
- one strategy only
- one asset only
- one timeframe only
- one approval flow only
- one journal path only

This MVP is not:

- live trading
- multi-provider support
- multi-asset portfolio logic
- machine learning
- dynamic strategy mutation
- broad UI work
- advanced optimization

## Provider choice

Use **Alpaca paper trading** as the first execution provider.

Reason:

- simple API setup
- dedicated paper environment
- cleaner first provider than starting with a live exchange
- good fit for proving the loop without real money risk

Important rule:

Alpaca is the first provider implementation, not the product surface.
The public workflow remains Founderos-first.

## First asset and timeframe

Use:

- **BTC/USD** only
- one timeframe only

The exact timeframe can be fixed during implementation, but it should remain singular for the MVP.
A simple default is a short intraday candle interval that is easy to test and review.

## First strategy

Use the most boring deterministic strategy that can still generate clear signals.

Recommended form:

- simple momentum or breakout rule
- one entry condition
- one invalidation condition
- one stop condition
- one exit condition

The first strategy must be easy to explain in one paragraph.
If the founder cannot quickly understand why a paper trade exists, the strategy is too complex for phase 1.

## MVP loop

The minimum end-to-end loop is:

1. fetch market data for BTC/USD
2. evaluate the single active strategy
3. return either:
   - no trade
   - one trade candidate
4. if a candidate exists, build the full trade object
5. move the candidate into a yes/no approval state
6. if approved, submit a paper order through Alpaca
7. record the order id, status, timestamps, and execution result
8. write the full entry into the journal path
9. later record close, P&L, and review fields

That is enough for the first proof.

## Minimum trade candidate shape

Every candidate should include at least:

- `candidate_id`
- `timestamp`
- `venue` = `alpaca_paper`
- `asset` = `BTC/USD`
- `timeframe`
- `strategy_name`
- `signal_version`
- `direction`
- `entry_price`
- `position_size`
- `max_risk`
- `thesis`
- `entry_reason`
- `invalidation`
- `stop_rule`
- `exit_rule`
- `status`

This object should be understandable by a human before any paper order is sent.

## Minimum approval states

Use only these states for the MVP:

- `proposed`
- `approved`
- `rejected`
- `submitted_paper`
- `filled_paper`
- `closed`
- `error`

Do not widen this state machine until the MVP loop works reliably.

## Founder approval rule

The desired interface is a narrow yes/no decision.

For the MVP, the founder should only need to decide whether to approve a proposed paper trade.
That means the system must surface:

- what the trade is
- why it exists
- what invalidates it
- where risk is capped

If the trade cannot be approved quickly from those fields, the candidate is not good enough.

## Alpaca paper execution path

The MVP execution path is:

1. receive an approved candidate
2. translate the candidate into an Alpaca paper order request
3. submit the order to Alpaca paper
4. capture the provider order id
5. capture provider status updates
6. map those updates into Founderos approval/execution states
7. record the final paper trade result into the journal

Execution should stay minimal.
No advanced provider abstraction is required beyond what is necessary to submit and track the first paper order cleanly.

## Journal logging path

The journal is required for the MVP.

Every paper trade should eventually produce a journal entry containing the fields already defined in `journal-schema.md`, or the closest MVP subset needed to start.

The minimum practical path is:

- write proposed candidate fields
- append approval decision
- append Alpaca order id and execution status
- append close data
- append P&L and review notes

The system should prefer a single coherent journal path over multiple partial logs.

## MVP success condition

This MVP is successful when Founderos can reliably do all of the following:

- detect a valid paper setup for BTC/USD
- create a legible candidate
- move it through approval
- submit it to Alpaca paper
- track the resulting status cleanly
- record the trade in a reviewable journal form

The first success condition is **loop integrity**, not profitability.

## What not to build yet

Do not add these before the MVP loop is working:

- live trading
- multiple assets
- multiple strategies
- dynamic sizing
- auto-approval
- portfolio dashboards
- optimization layers
- AI-generated strategy changes
- multiple providers

## Implementation tracks

OpenClaw should decompose this MVP into bounded tracks.

The first expected tracks are:

1. market data and strategy evaluation
2. candidate object and approval states
3. Alpaca paper order submission and status mapping
4. journal logging and review fields

Those tracks should be implemented one at a time.

## Canonical build rule

Build only enough to make the first paper loop work end to end.

If a proposed feature does not directly help:

- candidate generation
- founder approval
- Alpaca paper execution
- journal logging

then it is probably out of scope for this MVP.
