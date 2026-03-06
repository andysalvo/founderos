# MCP Layer

FounderOS exposes a standards-based MCP endpoint at:

- `POST /api/mcp`

This MCP layer is intentionally thin:

- It does not contain orchestration logic.
- It forwards to existing FounderOS endpoints.
- `tools.execute` remains the internal source of truth.

## Exposed MCP Tools

- `founderos.inspect` -> `POST /founderos/agent/inspect`
- `founderos.improve` -> `POST /founderos/agent/improve`
- `founderos.system_capabilities` -> `POST /founderos/system/capabilities`
- `founderos.tools_list` -> `POST /api/founderos/tools/execute` (`tools.list`)
- `founderos.memory_query` -> `GET /api/founderos/memory/query`
- `founderos.memory_write` -> `POST /api/founderos/memory/write`

## Auth and Safety

- MCP requires `x-founderos-key`.
- GitHub writes remain PR-only through existing tool logic.
- ALLOWED_REPOS enforcement remains in FounderOS GitHub tools.
