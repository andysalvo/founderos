# Journal Schema

## Purpose

The journal is the memory spine of the trading loop.
If the system cannot explain a trade later, the trade was not good enough to take.

## Minimum entry fields

Each paper trade entry should include:

- `trade_id`
- `timestamp_opened`
- `timestamp_closed`
- `venue`
- `asset`
- `timeframe`
- `strategy_name`
- `signal_version`
- `direction`
- `entry_price`
- `exit_price`
- `position_size`
- `max_risk`
- `thesis`
- `entry_reason`
- `invalidation`
- `stop_rule`
- `exit_reason`
- `outcome`
- `pnl_absolute`
- `pnl_percent`
- `rule_violations`
- `review_notes`

## Minimum setup fields before entry

Before a paper order is placed, capture:

- current market snapshot
- signal result
- why this trade qualifies
- what would invalidate it
- where risk is capped

## Minimum review fields after exit

After exit, capture:

- what happened
- whether the trade followed the rules
- whether the exit was planned or reactive
- whether the setup should be reused or rejected

## Founderos fit

Supabase should become the canonical place for the machine ledger later.
GitHub should hold the durable project docs, reviewed conclusions, and strategy revisions.
