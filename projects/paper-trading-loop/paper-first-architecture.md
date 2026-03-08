# Paper-First Architecture

## Goal

Create the smallest end-to-end loop that proves Founderos can behave like a disciplined paper-trading operator.

## Layers

### 1. Data layer

Responsible for:

- pulling market data
- maintaining a small watchlist
- normalizing the fields needed by the first strategy

Phase 1 target:

- one or two spot assets only
- one timeframe only

### 2. Signal layer

Responsible for:

- evaluating one tiny strategy
- returning a clear trade candidate or no-trade outcome
- attaching rationale and invalidation logic

Phase 1 target:

- one strategy only
- deterministic rules only

### 3. Paper execution layer

Responsible for:

- submitting paper orders or simulated orders
- capturing fills, timestamps, and state transitions
- keeping execution bounded and reversible

Phase 1 target:

- paper orders only
- no live-capital routing

### 4. Ledger layer

Responsible for:

- storing trade candidates
- storing paper trades
- storing outcomes and notes
- enabling review and comparison later

Founderos fit:

- Supabase is the canonical ledger spine
- GitHub can hold project docs, rule definitions, and reviewed conclusions

### 5. Review layer

Responsible for:

- post-trade review
- rule violations
- P&L snapshots
- identifying whether the strategy is behaving as expected

## Minimal phase-1 loop

1. fetch market data
2. evaluate one strategy
3. if valid, create one paper trade candidate
4. submit or simulate one paper order
5. log the full trade object
6. review the result later against the risk rules

## Deliberate omissions in phase 1

- live trading
- autonomous strategy mutation
- multi-asset portfolio optimization
- leverage
- derivatives
- order-book microstructure complexity
