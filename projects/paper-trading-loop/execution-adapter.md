# Execution Adapter

## Canonical rule

Founderos should expose **one public action surface** to the GPT: **Founderos APS**.

Broker, exchange, simulator, and market-execution providers should sit **behind APS** behind a provider-agnostic execution adapter boundary.

The GPT should not talk directly to Alpaca, Coinbase, Kraken, CCXT, or any later execution provider.

## Why this rule exists

This project is building a private human-in-the-loop trading operator, not a thin wrapper around one vendor.

If the public interface becomes shaped around a single provider too early, the system becomes harder to evolve later.
That would create avoidable rewrite pressure when:

- a better paper venue is chosen
- a live venue replaces the paper venue
- multiple venues are introduced later
- provider-specific payloads, status models, or errors change
- the system needs stronger logging, approvals, or policy checks than the provider exposes directly

This rule protects the architecture from becoming vendor-shaped.

## Public versus private boundary

### Public side

The GPT-facing surface should stay:

- high level
- approval oriented
- provider agnostic
- legible to the founder
- stable across backend changes

Public actions and concepts should be framed around things like:

- generate trade candidate
- review candidate
- approve paper execution
- approve live staging
- approve live execution
- fetch open trades
- fetch trade status
- fetch journal
- fetch review outcomes
- disable live mode

### Private side

The provider layer behind APS may be vendor specific.

That internal layer can include things like:

- Alpaca paper client
- Coinbase spot client
- Kraken spot client
- a simulator implementation
- a CCXT-based adapter
- status polling and reconciliation
- order translation
- venue-specific error handling
- position synchronization

Those details should remain private implementation details.

## The execution adapter concept

The execution adapter is the boundary between:

- Founderos as the trading control plane
- provider-specific execution systems

Its purpose is to let Founderos express one canonical intent model while supporting different providers over time.

That means the adapter should translate between:

### Founderos-side canonical objects

- trade candidate
- approved action
- paper order intent
- live trade staging intent
- live execution intent
- execution status
- fill event
- position snapshot
- account snapshot
- rejection reason
- provider incident

### Provider-side concrete objects

- provider order payloads
- provider account identifiers
- provider status enums
- provider fill/event formats
- provider position/account schemas
- provider error codes

## Design rule

The public model should be shaped by **founder approvals and trade intents**, not by provider APIs.

That means Founderos should decide what the canonical meaning of these things is:

- candidate
- approval
- rejection
- staged order
- submitted order
- filled order
- canceled order
- failed order
- paper account state
- live account state

Providers should then be translated into that model.

## First implementation choice

Alpaca is still the recommended **first paper implementation**.

That is a good choice because it offers a cleaner paper environment than starting directly with a live crypto exchange stack.

But Alpaca should be treated as:

- the first provider implementation
- not the canonical public interface
- not the system identity
- not the long-term architectural assumption

In other words:

**Alpaca is the first backend, not the product surface.**

## Future-proofing rule

Whenever a new provider is added, the default question should be:

**Can this be absorbed behind the execution adapter without changing the GPT-facing contract?**

If the answer is yes, the architecture is holding.
If the answer is no, the change should be treated as a design smell and examined carefully.

## Minimum provider contract

Any execution provider used by this project should be able to support the minimum needs of the current phase.

For paper trading, that means some subset of:

- authenticate safely behind APS
- expose account state
- accept a paper or simulated order intent
- return order identifiers
- report order status transitions
- report fills or simulated fills
- support cancellation when relevant
- allow reconciliation between provider state and Founderos state

The adapter should normalize these into Founderos objects before they reach the rest of the system.

## Logging and authority rule

Provider integrations should never bypass Founderos authority and logging boundaries.

That means:

- approvals still happen through Founderos
- risk checks still happen through Founderos
- journaling still happens through Founderos
- witness and durable execution logs still happen through Founderos
- the founder-facing narrative remains inside Founderos

Even if a provider offers its own logs or status pages, Founderos should remain the canonical operator ledger.

## Anti-patterns to avoid

Avoid these mistakes:

- exposing Alpaca directly as a public GPT action
- making the GPT schema provider specific
- naming core product concepts after provider objects
- allowing provider payloads to become the approval surface
- forcing future venues to conform to Alpaca-specific semantics
- bypassing APS for convenience
- treating the first integration as the permanent architecture

## Phase path

### Phase 1

Use an internal simulator or a paper provider through the execution adapter.

### Phase 2

Use Alpaca as the first paper execution adapter implementation.

### Phase 3

Add live trade staging through the same adapter boundary with stronger controls.

### Phase 4

Add one real live provider only if the earlier phases are stable enough to justify it.

### Phase 5

Only consider multiple providers if they clearly improve the operator loop rather than adding complexity for its own sake.

## Seed principle

This document exists to preserve a strong architectural seed:

**Founderos owns the public trading workflow. Providers supply execution capability behind a stable boundary.**

## Canonical sentence

Use this sentence when making future integration decisions:

**GPT talks to Founderos APS. Founderos talks to execution providers. Providers do not define the product surface.**
