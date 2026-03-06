# OpenClaw Bridge (Planned)

OpenClaw is planned as a runtime consumer, not the owner of FounderOS logic.

Target connection:

- OpenClaw -> FounderOS MCP (`/api/mcp`) -> FounderOS wrappers/tools.execute

FounderOS remains the control plane:

- Natural-language and planning logic stay in FounderOS.
- Execution dispatch stays in `tools.execute`.
- OpenClaw consumes the exposed `founderos.*` MCP tools.

Safety constraints that remain mandatory:

- `x-founderos-key` auth
- ALLOWED_REPOS enforcement
- PR-only repository writes (no direct push to `main`)
- No second orchestrator that bypasses FounderOS
