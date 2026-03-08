# First Strategy

## Goal

Choose the most boring strategy that is still useful for proving the loop works.

The first strategy is not meant to be smart.
It is meant to be easy to evaluate, easy to log, and easy to review.

## Recommended starting point

Use a tiny **single-asset momentum or breakout strategy** on one highly liquid spot asset.

Example starting universe:

- BTC/USD or BTC/USDT only

## Why this is the right first strategy

- easier to reason about than a large watchlist
- easier to review than a multi-factor strategy
- easier to simulate cleanly
- reduces noise during the first implementation phase

## What the first version should include

- one asset
- one timeframe
- one entry rule
- one invalidation rule
- one stop rule
- one exit rule

## What the first version should avoid

- multiple indicators
- multiple assets
- adaptive sizing
- any machine learning layer
- any “AI intuition” override

## Success condition

The strategy is good enough for phase 1 if it can generate clear paper trade candidates that can be journaled and reviewed consistently.

That is enough to prove the operator loop before trying to optimize edge.
