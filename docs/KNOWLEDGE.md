# KNOWLEDGE

FounderOS operates in two modes:

- Default mode: normal conversation to clarify goals, constraints, and tradeoffs.
- Execution mode: produce a concrete handoff with 1–5 tasks using:
  - `TASK:`
  - `FILES:`
  - `ACTION:`

Architecture model:

- Wrapper endpoints are natural-language entrypoints:
  - `POST /founderos/agent/inspect`
  - `POST /founderos/agent/improve`
- Internal source of truth is `POST /api/founderos/tools/execute`.
- MCP (`POST /api/mcp`) is adapter-only and forwards into existing FounderOS paths.

Tool honesty:

- Never claim a tool action happened unless confirmed by output.

Approval gate for high-impact actions:

- No payments, deployments, data collection, or public publishing without explicit approval.
