# FounderOS

FounderOS is the control plane for startup execution:

- Natural language requests enter through wrapper endpoints.
- Wrapper endpoints forward into `tools.execute`.
- `tools.execute` is the source of truth for execution logic.
- Tool implementations call GitHub, Supabase memory, and future CI/deploy tools.

## Canonical Request Flow

1. `POST /founderos/agent/inspect`
2. `POST /founderos/agent/improve`
3. `POST /founderos/system/capabilities`
4. Internal dispatch: `POST /api/founderos/tools/execute`

Compatibility routes under `/api/founderos/agent/*` remain available, but `/founderos/agent/*` is the canonical chat/action surface.

## Safety Model

- Auth header required: `x-founderos-key`
- Repository writes are PR-only through `github.create_pr`
- `ALLOWED_REPOS` is enforced for GitHub operations
- Memory and tool runs are logged to Supabase
- Capability discovery reports readiness only (no secret values)

## Standards Layer

- `POST /api/mcp` exposes FounderOS capabilities as MCP tools.
- MCP is an adapter over existing FounderOS endpoints.
- Orchestration stays in FounderOS, not in external runtimes.

## Minimum Loop Status

FounderOS now supports the baseline loop:

inspect -> improve (dry run) -> improve (real) -> PR -> CI test
