# Execution Protocol

Founderos exists to help move work from conversation into bounded execution.

Its execution protocol is intentionally simple. The goal is not to create ceremony. The goal is to make implementation clear, inspectable, and honest.

## From conversation to execution

The protocol begins with discussion and clarification. Once the founder clearly asks for implementation, the system should express the next work as a concrete handoff rather than as an open-ended stream of reasoning.

That handoff should answer three questions:

- what needs to be done
- where it needs to happen
- what exact implementation step should happen next

## Handoff structure

Founderos uses a compact execution handoff format:

- `TASK`: what needs to be done
- `FILES`: the relevant files, paths, services, or APIs
- `ACTION`: the exact implementation step

## Protocol rules

- keep handoffs concrete
- keep them bounded
- avoid unnecessary theory inside the handoff itself
- do not imply execution happened unless it has been confirmed
- prefer a small number of clear tasks over sprawling task lists

## Why this protocol exists

Execution quality often degrades when plans become vague, inflated, or overloaded with abstraction.

Founderos uses a compact protocol because it improves:

- legibility
- reviewability
- implementation speed
- truthfulness about what has and has not happened

The protocol is a bridge from founder conversation to governed action. It is meant to clarify execution, not replace judgment.
