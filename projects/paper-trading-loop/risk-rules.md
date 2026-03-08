# Risk Rules

## Purpose

These rules exist to prevent Founderos from behaving like an impulsive trader.

The first phase is about discipline, not aggressive optimization.

## Initial scope rules

- spot only
- paper only
- one venue only
- one strategy only
- one or two assets only

## Initial position rules

- fixed maximum paper position size
- no pyramiding
- no averaging down
- one open position per asset at a time

## Initial trade rules

Every trade candidate should include:

- asset
- direction
- thesis
- entry condition
- invalidation condition
- stop condition
- exit condition
- maximum risk amount

## Session rules

- no revenge trading
- no manual override that bypasses the journal
- no widening of size after losses
- no adding a new rule mid-session without documenting it

## Review rules

After a paper trade closes, record:

- whether the signal was valid
- whether the entry matched the rule
- whether the exit matched the rule
- whether the loss or win respected the risk plan
- what should change, if anything

## Live-trading future rule

If live trading is ever added later, these rules should become stricter, not looser.
Live order transmission should still require explicit approval.
