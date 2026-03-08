# Amendment 005: Financial Connectors and Money-Path Control

## Purpose

This amendment creates the first governance basis for broker, market-data, and trading-adapter power inside Founderos.

## Principle

Financial connectors are not ordinary tools.
They are money-path powers and must remain legible, attributable, reviewable, and revocable.

## Rule

Founderos may use financial connectors only when:

1. the connector purpose is named,
2. the reachable domain is named,
3. credential ownership is defined,
4. APS remains the authority boundary for execution,
5. logging expectations are defined,
6. kill-switch behavior is defined,
7. and a practical revocation path exists.

## Authority location

APS owns:

- broker connector admission
- market-data connector admission
- key placement policy
- live-mode enablement
- execution-policy checks
- kill-switch state
- witness logging for connector-mediated actions

OpenClaw may research and recommend around admitted connectors, but it does not own financial execution authority.

## Credential rule

Live or paper broker secrets should live in APS-owned secret stores or APS-owned server-side adapters by default.
They should not be placed in chat, repo files, or routine worker runtime env unless a later narrower decision explicitly allows a limited exception.

## Logging rule

Any connector-mediated execution path should record:

- connector identity
- actor lane
- strategy identity
- candidate identity
- policy verdict
- execution result
- and revocation or suspension events when they occur

## Revocation rule

Financial connector power must be revocable through:

- key rotation or revocation
- connector disablement
- live-mode disablement
- policy restriction
- or amendment-level suspension
