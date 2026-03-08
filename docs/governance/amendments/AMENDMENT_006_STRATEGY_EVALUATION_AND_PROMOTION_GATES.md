# Amendment 006: Strategy Evaluation and Promotion Gates

## Purpose

This amendment requires formal evaluation and promotion artifacts before trading strategies can gain broader authority.

## Principle

A stronger strategy claim is not authority by itself.
Promotion must be earned through legible evidence and governed review.

## Rule

A strategy may not move between authority stages unless the relevant evaluation artifacts exist.

Those stages include:

- research to paper candidate generation
- paper candidate generation to paper execution
- paper execution to any live staging
- live staging to any autonomous live execution

## Required artifacts

Promotion artifacts should define:

- strategy identity and version
- dataset or market regime basis
- trial count
- parameter search scope
- cost assumptions
- serial-correlation-aware metrics
- overfitting checks
- promotion verdict
- suspension triggers

## Gate rule

The research gate, paper gate, and live gate must be explicit and separately recorded.

If an artifact is missing, stale, or ambiguous, the narrower stage prevails.

## Suspension rule

A promoted strategy may be narrowed or suspended when:

- parity fails between research and paper behavior
- broker-order behavior becomes inconsistent
- live canary behavior violates policy
- or the strategy loses legibility or reviewability
