import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("OpenAPI exposes canonical wrapper actions", async () => {
  const openapi = await readFile(
    new URL("../../../docs/openapi.founderos.yaml", import.meta.url),
    "utf8",
  );

  assert.match(openapi, /\/founderos\/agent\/inspect:/);
  assert.match(openapi, /operationId:\s*agentInspect/);
  assert.match(openapi, /\/founderos\/agent\/improve:/);
  assert.match(openapi, /operationId:\s*agentImprove/);
  assert.match(openapi, /\/founderos\/system\/capabilities:/);
  assert.match(openapi, /operationId:\s*systemCapabilities/);
  assert.doesNotMatch(openapi, /operationId:\s*toolsExecute/);
});

test("wrapper routes forward to tools.execute with fixed tool names", async () => {
  const inspectWrapper = await readFile(
    new URL("../app/founderos/agent/inspect/route.ts", import.meta.url),
    "utf8",
  );
  const improveWrapper = await readFile(
    new URL("../app/founderos/agent/improve/route.ts", import.meta.url),
    "utf8",
  );
  const capabilitiesWrapper = await readFile(
    new URL("../app/founderos/system/capabilities/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(inspectWrapper, /\/api\/founderos\/tools\/execute/);
  assert.match(inspectWrapper, /toolName:\s*"agent\.inspect_repo"/);
  assert.match(improveWrapper, /\/api\/founderos\/tools\/execute/);
  assert.match(improveWrapper, /toolName:\s*"agent\.self_improve"/);
  assert.match(capabilitiesWrapper, /\/api\/founderos\/tools\/execute/);
  assert.match(capabilitiesWrapper, /toolName:\s*"system\.capabilities"/);
});

test("MCP route exposes thin adapter tool names", async () => {
  const mcpRoute = await readFile(
    new URL("../app/api/mcp/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(mcpRoute, /founderos\.inspect/);
  assert.match(mcpRoute, /founderos\.improve/);
  assert.match(mcpRoute, /founderos\.tools_list/);
  assert.match(mcpRoute, /founderos\.system_capabilities/);
  assert.match(mcpRoute, /founderos\.memory_query/);
  assert.match(mcpRoute, /founderos\.memory_write/);
});
