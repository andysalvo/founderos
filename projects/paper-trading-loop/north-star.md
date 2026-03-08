# North Star

## Canonical product statement

Founderos should become a **private human-in-the-loop crypto trading operator** where the AI does the market work and the founder mostly gives **yes/no approvals** for bounded real actions.

The desired user experience is simple:

- the system watches markets continuously
- the system produces clear trade prompts
- the founder reviews a proposed action
- the founder answers yes or no
- on yes, the system carries out the approved bounded action
- on no, the system discards the action and records the rejection
- every step is logged, reviewable, and attributable

## What we are actually building

We are not building:

- a generic trading bot
- a broad consumer product
- a magic market predictor
- a fully autonomous money system with unclear accountability

We are building:

- a private operator for one founder
- a bounded crypto trading workflow
- a system where AI does most of the repetitive market work
- a system where the founder remains the approval authority for consequential actions

## Core promise

The value of Founderos in this project is not that it claims to predict markets perfectly.

The value is that it can:

- monitor markets continuously
- structure trade opportunities clearly
- apply explicit risk rules consistently
- reduce impulsive behavior
- make execution cleaner
- keep a durable ledger of decisions and outcomes
- improve the operator loop over time

## Operator loop

The canonical loop is:

1. gather market data
2. evaluate the active strategy rules
3. produce either a no-trade result or a trade candidate
4. attach thesis, entry, invalidation, stop, exit, size, and risk
5. present the candidate to the founder in a yes/no approval format
6. on yes, carry out the bounded approved action for the current project phase
7. on no, reject the action and record the rejection
8. journal the full object and all state transitions
9. review the outcome later and improve the system

## Approval model

The target interface is intentionally narrow.

The founder should not need to manually perform the whole trading workflow.
The founder should mostly need to decide:

- yes
- no
- not now
- tighten the rule
- reduce size
- disable live mode

That is the real product experience.

## Automation model

Founderos should advance this project through two repeating loops.

### 1. Research loops

Research loops exist to figure out what needs to be built next.

They should:

- inspect the current project state
- identify the highest-leverage missing capability
- compare implementation options
- narrow the next requirement into a bounded artifact
- produce legible specs, decisions, and task proposals

Research loops answer:

- what is missing
- what is ambiguous
- what is risky
- what should be built next
- what should not be built yet

### 2. Coding loops

Coding loops exist to build the next bounded piece through automation.

They should:

- take a bounded requirement from research
- inspect the repo
- propose an exact implementation
- write code or docs in the allowed scope
- return a reviewable output
- preserve logs and attribution

Coding loops answer:

- how the next capability gets implemented
- what files change
- what behavior is added
- what remains out of scope

## Why Founderos is a fit

Founderos is already strong at:

- bounded execution
- approvals
- durable logs
- structured outputs
- orchestration
- worker loops
- repo inspection and implementation shaping

That means it is well suited to becoming the control plane for this operator.

## Phase path

### Phase 1

**Yes/no approvals on paper trades**

The system may research, monitor, generate signals, simulate execution, and journal outcomes.
No live money movement.

### Phase 2

**Yes/no approvals on live trade staging**

The system may prepare real trade candidates with full risk context and route them to a human approval gate, but not transmit live orders without explicit approval.

### Phase 3

**Yes/no approvals on live execution**

The system may transmit narrowly bounded live spot orders only after explicit founder approval and with durable audit logging.

### Phase 4

**Optional limited auto-approval only for explicitly authorized cases**

This phase is not the default and should only be considered after the earlier phases are legible, stable, and profitable enough to justify it.

## Build rule

Do not widen the system by chasing novelty.
Build the smallest missing piece that most increases confidence in the operator loop.

The order of work should generally be:

1. make the next decision legible
2. define the bounded requirement
3. automate the implementation
4. review the result
5. tighten the loop

## Success condition

Success is not that the system sounds intelligent.

Success is that:

- trade prompts are high quality
- risk is explicit
- the founder can approve quickly
- execution is reliable
- every action is logged
- review produces real learning
- performance improves over time

## Canonical rule

This project should be guided by one simple truth:

**Founderos exists to turn AI market work into founder-approved trading actions through a narrow yes/no interface.**
