# Exchange and Simulator Choice

## First choice for paper trading

Use a paper-trading environment first.

The initial choice should optimize for:

- simple API access
- clean documentation
- easy order simulation
- fast setup
- low operational complexity

## Recommended first path

Start with **Alpaca paper trading** as the first paper environment.

Reason:

- it supports a dedicated paper environment
- it is straightforward for API-based testing
- it is a cleaner first integration target than a full live exchange stack

## Why not start with a live exchange

Live exchange APIs introduce unnecessary early complexity:

- key management risk
- real-money risk
- exchange-specific order edge cases
- temptation to skip the journal-and-review discipline

This project should first prove process, not profitability.

## Later exchange candidates for live spot staging

Only after the paper loop is stable should Founderos consider live spot staging on a real exchange.

Likely candidates later:

- Coinbase Advanced Trade
- Kraken Spot

## Rule for phase 1

Choose one paper venue only.
Do not build multi-exchange support in the first iteration.
