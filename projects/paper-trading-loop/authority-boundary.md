# Authority Boundary

## Core rule

This project begins as a **paper-trading system only**.

The goal is not to chase live profit before the system is legible.
The goal is to build a disciplined operator loop that can later stage live trades safely.

## Allowed in phase 1

- market data collection
- watchlist maintenance
- signal generation
- paper-order generation
- paper-order submission to a simulator or paper API
- trade journaling
- post-trade review
- strategy comparison
- risk-check enforcement inside simulation

## Not allowed in phase 1

- live order submission
- real money movement
- withdrawals
- leveraged trading
- derivatives trading
- adding exchange keys that can move real funds
- widening the strategy universe without explicit review

## Future north star boundary

If this project later progresses to live trading, the live boundary should be:

- Founderos may research, monitor, stage, and prepare live spot orders
- APS must remain the approval gate for any real order transmission
- the founder remains the decision-maker for live execution
- every live order must have explicit authorization and a durable audit trail

## Human-required actions

Even in later phases, these actions should remain human-authorized:

- turning live mode on
- changing max risk limits
- widening the tradable asset list
- adding or rotating exchange keys
- switching exchanges
- approving any live order

## Project discipline

If a proposed implementation weakens this boundary, it should be treated as out of scope for the current project phase.
