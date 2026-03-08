# Amendment 007: Autonomous Live Trading Authority

## Purpose

This amendment defines the governance path for any future autonomous live trading power inside Founderos.

## Principle

Autonomous live trading is not an implementation detail.
It is a major authority expansion and must remain staged, bounded, revocable, and testable.

## Staged authority model

### Stage 0

- paper only
- no live order transmission

### Stage 1

- live staging only
- APS may prepare live candidates
- human approval remains required for transmission

### Stage 2

- canary autonomous live execution
- limited asset set
- limited size
- limited connector set
- explicit kill-switch readiness

### Stage 3

- broader autonomous live execution under still-active APS policy, risk limits, witness logging, and suspension rules

## Activation conditions

No autonomous live stage may activate unless:

1. the connector is admitted,
2. the strategy promotion artifacts are complete,
3. the risk policy is active,
4. the kill switch has been tested,
5. rollback behavior has been tested,
6. and the activation basis is durably recorded.

## Boundaries

Autonomous live authority must remain bounded by:

- named assets
- named connectors
- named max-risk rules
- named canary scope
- named rollback conditions
- named suspension conditions

## Suspension and rollback

The system should favor suspension first when:

- live behavior becomes illegible
- policy parity fails
- operator confidence drops materially
- broker state diverges from governed state
- or kill-switch integrity is uncertain
