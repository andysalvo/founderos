# Trading Agent Research Notes

Status: active research brief

## Purpose

This document keeps the high-signal research basis for the Paper Trading Loop in one place.

It exists to prevent the trading system from drifting into:

- undocumented assumptions
- overfit strategy changes
- vague promotion rules
- or hidden autonomy growth

## Repo-grounded findings

### APS is the authority boundary

Founderos already defines APS as the authority and policy layer.

That means:

- broker keys belong in APS-owned adapters and secret stores
- live-mode toggles belong in APS policy and governed state
- risk gates belong in APS validation, not in ad hoc worker behavior
- OpenClaw may research, backtest, scan, and recommend, but it should not own money-moving authority

### The repo already has an emerging governed type system

The current system is governance-first rather than trading-first.

Existing durable object families include:

- `plan_artifacts`
- `orchestration_jobs`
- `orchestration_events`
- `witness_events`
- policy-bearing artifacts
- target durable objects in the system spec such as `decisions`, `documents`, and `connectors`

The correct move is to extend this object model with trading-native objects rather than bolt on a separate trading blob.

### Current project docs are intentionally narrower than the desired end-state

The Paper Trading Loop docs currently optimize for:

- paper trading first
- human-authorized live staging later
- human-authorized live execution after that

They explicitly reject fully autonomous live trading in the current phase.

If Founderos is going to pursue autonomous live trading later, that must happen through amendments and staged promotion rules, not by silent implementation drift.

## External research notes

### Broker and execution realities

Alpaca paper and live share the same API contract, which is useful for parity testing.

Operational implications:

- use one broker adapter interface across paper and live
- keep execution state machine parity between paper and live
- store `client_order_id` and broker order ids as first-class fields
- stream or poll order updates into APS-owned order-state objects rather than assuming immediate fills

### Research hygiene

Naive backtests are not sufficient.

The system should record:

- exact dataset range
- exact strategy version
- exact parameter set
- exact number of trials
- turnover and cost assumptions
- serial-correlation-aware performance metrics
- PBO-style overfitting checks
- DSR-style selection-bias correction

Inference:

The ambitious path is not giving the model more unconstrained freedom.
It is making strategy promotion more evidence-heavy.

### Strategy family implications

Crypto momentum evidence is mixed.

That supports a staged research program:

1. interpretable momentum or breakout baseline
2. volatility-managed momentum challenger
3. stop-loss momentum challenger
4. regime-gated momentum challenger
5. ML meta-filter only as a challenger after deterministic baselines exist

No single strategy family should receive live authority merely because it looked good in one backtest window.

## Promotion standard summary

### Research gate

A strategy may move from idea to paper candidate generation only when:

- the research artifact is complete
- the evaluation run object is recorded
- PBO and DSR fields are recorded
- trial count and parameter search scope are recorded
- cost assumptions are recorded
- the strategy is explainable in ordinary language

### Paper gate

A strategy may move from research into paper execution only when:

- shadow scan parity is confirmed
- paper order state transitions are mapped cleanly
- journal completeness is verified
- restart and resync behavior is verified

### Live gate

A strategy may move from paper into any live authority only when:

- the necessary amendments have been adopted
- the connector is admitted
- APS kill-switch behavior is verified
- max-risk policy is set
- canary live mode succeeds
- rollback and suspension paths are tested

## Working defaults

- production baseline asset: `BTC/USD`
- challenger research assets before widening: `ETH/USD`, `SOL/USD`
- market type: spot only
- leverage: disabled
- derivatives: disabled
- live autonomy: future staged power only, not current permission
