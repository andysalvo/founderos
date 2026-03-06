import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);

const healthHandler = require("../api/founderos/health.js");
const capabilitiesHandler = require("../api/founderos/capabilities.js");
const precommitPlanHandler = require("../api/founderos/precommit/plan.js");
const openClawInspectHandler = require("../api/founderos/runtime/openclaw/inspect.js");
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

  for (const path of [
    "/api/founderos/health:",
    "/api/founderos/capabilities:",
    "/api/founderos/precommit/plan:",
    "/api/founderos/runtime/openclaw/inspect:",
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

  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com/analyze";
  process.env.OPENCLAW_API_KEY = "openclaw-secret";
  process.env.ALLOWED_REPOS = "owner/repo";

  const authorized = await invoke(capabilitiesHandler, {
    method: "GET",
    headers: { "x-founderos-key": "test-key" },
  });

  assert.equal(authorized.statusCode, 200);
  assert.equal(authorized.json.endpoints.length, 5);
  assert.equal(authorized.json.openapi.path, "docs/openapi.founderos.yaml");
  assert.equal(authorized.json.openapi.version, "3.1.0");
  assert.equal(Array.isArray(authorized.json.operator_inputs.required_env), true);
  assert.equal(Array.isArray(authorized.json.operator_inputs.missing_env), true);
  assert.equal(authorized.json.operator_inputs.readiness.planning_ready, true);
  assert.equal(authorized.json.operator_inputs.readiness.openclaw_runtime_ready, true);
  assert.deepEqual(
    authorized.json.endpoints.map((item) => item.path),
    [
      "/api/founderos/health",
      "/api/founderos/capabilities",
      "/api/founderos/precommit/plan",
      "/api/founderos/runtime/openclaw/inspect",
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

test("capabilities reports missing operator inputs without exposing secret values", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  delete process.env.OPENCLAW_BASE_URL;
  delete process.env.OPENCLAW_API_KEY;
  delete process.env.ALLOWED_REPOS;
  delete process.env.GITHUB_APP_ID;
  delete process.env.GITHUB_INSTALLATION_ID;
  delete process.env.GITHUB_APP_PRIVATE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const response = await invoke(capabilitiesHandler, {
    method: "GET",
    headers: { "x-founderos-key": "test-key" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.operator_inputs.readiness.planning_ready, true);
  assert.equal(response.json.operator_inputs.readiness.openclaw_runtime_ready, false);
  assert.equal(response.json.operator_inputs.readiness.commit_ready, false);
  assert.match(response.json.operator_inputs.missing_env.join(","), /OPENCLAW_BASE_URL/);
  assert.match(response.json.operator_inputs.missing_env.join(","), /OPENCLAW_API_KEY/);
  assert.match(response.json.operator_inputs.missing_env.join(","), /GITHUB_APP_ID/);
  assert.equal("value" in response.json.operator_inputs.required_env[0], false);
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

test("precommit plan tolerates common model-style aliases for the request field", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";

  const response = await invoke(precommitPlanHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    body: {
      request: "test plan alias",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.artifact.human_readable_summary, "Proposal only: test plan alias");
});

test("openclaw inspect requires auth", async () => {
  const response = await invoke(openClawInspectHandler, {
    method: "POST",
    headers: {},
    body: { task: "Inspect the current Founderos contract." },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json.ok, false);
  assert.equal(response.json.error, "unauthorized");
  assert.equal(typeof response.json.request_id, "string");
});

test("openclaw inspect also accepts bearer auth for GPT compatibility", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com/analyze";
  process.env.OPENCLAW_API_KEY = "openclaw-secret";

  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        summary: "OpenClaw analyzed the repo.",
        findings: [],
        suggested_next_actions: [],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  try {
    const response = await invoke(openClawInspectHandler, {
      method: "POST",
      headers: { authorization: "Bearer test-key" },
      body: { task: "Inspect the current Founderos contract." },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json.ok, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("openclaw inspect reports missing env configuration", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  delete process.env.OPENCLAW_BASE_URL;
  delete process.env.OPENCLAW_API_KEY;

  const response = await invoke(openClawInspectHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    body: { task: "Inspect the current Founderos contract." },
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.json.error, "openclaw_not_configured");
  assert.equal(typeof response.json.request_id, "string");
});

test("openclaw inspect rejects write-oriented requests", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com/analyze";
  process.env.OPENCLAW_API_KEY = "openclaw-secret";

  const response = await invoke(openClawInspectHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    body: {
      task: "Commit the changes to the repository",
      authorization: { no: "thanks" },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json.error, "analysis_only");
  assert.equal(typeof response.json.request_id, "string");
});

test("openclaw inspect returns normalized success response", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.OPENCLAW_BASE_URL = "https://openclaw.example.com/analyze";
  process.env.OPENCLAW_API_KEY = "openclaw-secret";

  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    assert.equal(url, "https://openclaw.example.com/analyze");
    assert.equal(init.method, "POST");

    const headers = new Headers(init.headers);
    assert.equal(headers.get("authorization"), "Bearer openclaw-secret");
    assert.equal(headers.get("x-founderos-key"), null);

    const payload = JSON.parse(init.body);
    assert.deepEqual(payload, {
      task: "Inspect the current Founderos contract.",
      repo: "owner/repo",
      branch: "main",
    });

    return new Response(
      JSON.stringify({
        result: {
          summary: "OpenClaw analyzed the repo.",
          findings: ["Route surface is minimal."],
          suggested_next_actions: ["Keep the bridge analysis-only."],
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  };

  try {
    const response = await invoke(openClawInspectHandler, {
      method: "POST",
      headers: { "x-founderos-key": "test-key" },
      body: {
        task: "Inspect the current Founderos contract.",
        repo: "owner/repo",
        branch: "main",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json, {
      ok: true,
      runtime: "openclaw",
      mode: "analysis_only",
      summary: "OpenClaw analyzed the repo.",
      findings: ["Route surface is minimal."],
      suggested_next_actions: ["Keep the bridge analysis-only."],
      request_id: response.json.request_id,
    });
    assert.equal(typeof response.json.request_id, "string");
  } finally {
    global.fetch = originalFetch;
  }
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
