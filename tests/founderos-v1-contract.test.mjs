import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);

const healthHandler = require("../api/founderos/health.js");
const capabilitiesHandler = require("../api/founderos/capabilities.js");
const capabilitiesCheckHandler = require("../api/founderos/capabilities/check.js");
const precommitPlanHandler = require("../api/founderos/precommit/plan.js");
const commitExecuteHandler = require("../api/founderos/commit/execute.js");

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(payload) {
      this.body = payload;
      return payload;
    },
  };
}

async function invoke(handler, req) {
  const res = createMockResponse();
  await handler(req, res);
  return {
    statusCode: res.statusCode,
    headers: res.headers,
    json: res.body ? JSON.parse(res.body) : undefined,
  };
}

test("OpenAPI surface is exactly the minimal v1 contract", async () => {
  const openapi = await readFile(new URL("../docs/openapi.founderos.yaml", import.meta.url), "utf8");

  assert.match(
    openapi,
    /https:\/\/founderos-alpha\.vercel\.app/
  );
  assert.match(
    openapi,
    /servers:\s*\n\s*- url: https:\/\/founderos-alpha\.vercel\.app\s*\nsecurity:\s*\n\s*- FounderosApiKey: \[\]/
  );

  for (const path of [
    "/api/founderos/health:",
    "/api/founderos/capabilities:",
    "/api/founderos/capabilities/check:",
    "/api/founderos/precommit/plan:",
    "/api/founderos/commit/execute:",
  ]) {
    assert.match(openapi, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const forbidden of [
    "/api/founderos/memory/",
    "/founderos/agent/",
    "/api/mcp",
    "/api/founderos/witness/",
    "/founderos/system/",
  ]) {
    assert.doesNotMatch(openapi, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("health handler matches the documented shape", async () => {
  const response = await invoke(healthHandler, { method: "GET", headers: {} });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.json).sort(), ["ok", "service", "timestamp", "version"]);
  assert.equal(response.json.ok, true);
});

test("capabilities requires auth and returns only the five active endpoints", async () => {
  const unauthorized = await invoke(capabilitiesHandler, { method: "GET", headers: {} });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.json.error, "unauthorized");
  assert.equal(unauthorized.json.auth_received_via, "none");
  assert.equal(unauthorized.json.expected_key_configured, false);

  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.ALLOWED_REPOS = "owner/repo";

  const authorized = await invoke(capabilitiesHandler, {
    method: "GET",
    headers: { "x-founderos-key": "test-key" },
  });

  assert.equal(authorized.statusCode, 200);
  assert.equal(authorized.json.endpoints.length, 5);
  assert.equal(authorized.json.openapi.path, "docs/openapi.founderos.yaml");
  assert.deepEqual(
    authorized.json.endpoints.map((item) => item.path),
    [
      "/api/founderos/health",
      "/api/founderos/capabilities",
      "/api/founderos/capabilities/check",
      "/api/founderos/precommit/plan",
      "/api/founderos/commit/execute",
    ]
  );
});

test("capabilities also accepts bearer auth for GPT compatibility", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";

  const response = await invoke(capabilitiesHandler, {
    method: "GET",
    headers: { authorization: "Bearer test-key" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
});

test("capabilities reports auth transport on unauthorized requests", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";

  const response = await invoke(capabilitiesHandler, {
    method: "GET",
    headers: { authorization: "Bearer wrong-key" },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json.error, "unauthorized");
  assert.equal(response.json.auth_received_via, "authorization-bearer");
  assert.equal(response.json.expected_key_configured, true);
});

test("capabilities check mirrors capabilities over POST", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.ALLOWED_REPOS = "owner/repo";

  const unauthorized = await invoke(capabilitiesCheckHandler, {
    method: "POST",
    headers: {},
    body: {},
  });

  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.json.auth_received_via, "none");

  const authorized = await invoke(capabilitiesCheckHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    body: {},
  });

  assert.equal(authorized.statusCode, 200);
  assert.equal(authorized.json.ok, true);
  assert.equal(authorized.json.endpoints.length, 5);
  assert.equal(authorized.json.endpoints[2].path, "/api/founderos/capabilities/check");
});

test("precommit plan stays proposal-only", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";

  const response = await invoke(precommitPlanHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    body: {
      user_request: "Update the OpenAPI docs and verify the API routes",
      scope: {
        repo: "owner/repo",
        branch: "main",
        allowed_paths: ["docs/openapi.founderos.yaml"],
      },
      constraints: ["No durable writes before explicit authorization"],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.artifact.mode, "proposal_only");
  assert.match(response.json.artifact.next_step, /explicit authorization/i);
  assert.equal(response.json.artifact.warnings.length, 1);
});

test("commit.execute rejects protected paths before any external call", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.ALLOWED_REPOS = "owner/repo";

  const writeSet = {
    branch_name: "founderos-test",
    base_branch: "main",
    title: "Test update",
    repo: "owner/repo",
    files: [
      {
        path: "api/founderos/health.js",
        action: "update",
        content: "console.log('nope');",
      },
    ],
  };

  const response = await invoke(commitExecuteHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    body: {
      write_set: writeSet,
      authorization: {
        plan_artifact_id: "plan_123",
        plan_artifact_hash: "artifact_hash",
        write_set_hash: createHash("sha256").update(JSON.stringify(writeSet)).digest("hex"),
        authorized_by: "tester",
      },
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "protected_path");
});

test("commit.execute fails closed when witness storage is not configured", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.ALLOWED_REPOS = "owner/repo";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.GITHUB_APP_ID = "123";
  process.env.GITHUB_INSTALLATION_ID = "456";
  process.env.GITHUB_APP_PRIVATE_KEY = "test";

  const writeSet = {
    branch_name: "founderos-test",
    base_branch: "main",
    title: "Test update",
    repo: "owner/repo",
    files: [
      {
        path: "docs/notes.md",
        action: "create",
        content: "hello",
      },
    ],
  };

  const response = await invoke(commitExecuteHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    body: {
      write_set: writeSet,
      authorization: {
        plan_artifact_id: "plan_123",
        plan_artifact_hash: "artifact_hash",
        write_set_hash: createHash("sha256").update(JSON.stringify(writeSet)).digest("hex"),
        authorized_by: "tester",
      },
    },
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.json.error, "witness_not_configured");
});
