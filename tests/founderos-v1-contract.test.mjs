import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { hashJson } = require("../api/_lib/founderos-v1.js");

const healthHandler = require("../api/founderos/health.js");
const capabilitiesHandler = require("../api/founderos/capabilities.js");
const capabilitiesCheckHandler = require("../api/founderos/capabilities/check.js");
const precommitPlanHandler = require("../api/founderos/precommit/plan.js");
const repoFileHandler = require("../api/founderos/repo/file.js");
const repoTreeHandler = require("../api/founderos/repo/tree.js");
const freezeWriteSetHandler = require("../api/founderos/commit/freeze-write-set.js");
const commitExecuteHandler = require("../api/founderos/commit/execute.js");
const commitMergePrHandler = require("../api/founderos/commit/merge-pr.js");
const commitAutoExecuteHandler = require("../api/founderos/commit/auto-execute.js");
const orchestrateSubmitHandler = require("../api/founderos/orchestrate/submit.js");
const orchestrateJobStatusHandler = require("../api/founderos/orchestrate/jobs/[job_id].js");
const orchestrateClaimHandler = require("../api/founderos/orchestrate/claim.js");

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

function extractWorkerFreshnessHelpers(source) {
  const markerStart = source.indexOf("function hasLiveWorkerAuthMarkers");
  const proposalStart = source.indexOf("function buildImprovementProposal");
  const proposalEnd = source.indexOf("const improvementProposal = buildImprovementProposal");

  assert.notEqual(markerStart, -1);
  assert.notEqual(proposalStart, -1);
  assert.notEqual(proposalEnd, -1);

  const helperSource = source.slice(markerStart, proposalEnd);
  const factory = new Function(
    `${helperSource}\nreturn { hasLiveWorkerAuthMarkers, buildImprovementProposal };`
  );

  return factory();
}

function loadFreshCommonJs(modulePath, mocks = {}) {
  const resolvedTarget = require.resolve(modulePath);
  const priorEntries = new Map();

  delete require.cache[resolvedTarget];

  for (const [mockPath, mockExports] of Object.entries(mocks)) {
    const resolvedMock = require.resolve(mockPath);
    priorEntries.set(resolvedMock, require.cache[resolvedMock]);
    require.cache[resolvedMock] = {
      id: resolvedMock,
      filename: resolvedMock,
      loaded: true,
      exports: mockExports,
    };
  }

  try {
    return require(resolvedTarget);
  } finally {
    delete require.cache[resolvedTarget];
    for (const [resolvedMock, priorEntry] of priorEntries.entries()) {
      if (priorEntry) {
        require.cache[resolvedMock] = priorEntry;
      } else {
        delete require.cache[resolvedMock];
      }
    }
  }
}

test("OpenAPI surface exposes only the public APS contract", async () => {
  const openapi = await readFile(new URL("../docs/openapi.founderos.yaml", import.meta.url), "utf8");

  assert.match(
    openapi,
    /https:\/\/founderos-alpha\.vercel\.app/
  );
  assert.match(
    openapi,
    /servers:\s*\n\s*- url: https:\/\/founderos-alpha\.vercel.app\s*\nsecurity:\s*\n\s*- FounderosApiKey: \[\]/
  );

  for (const path of [
    "/api/founderos/health:",
    "/api/founderos/capabilities:",
    "/api/founderos/capabilities/check:",
    "/api/founderos/precommit/plan:",
    "/api/founderos/repo/file:",
    "/api/founderos/repo/tree:",
    "/api/founderos/commit/freeze-write-set:",
    "/api/founderos/commit/execute:",
    "/api/founderos/commit/merge-pr:",
    "/api/founderos/orchestrate/submit:",
    "/api/founderos/orchestrate/jobs/{job_id}:",
  ]) {
    assert.match(openapi, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const forbidden of [
    "/api/founderos/memory/",
    "/founderos/agent/",
    "/api/mcp",
    "/api/founderos/witness/",
    "/founderos/system/",
    "/api/founderos/orchestrate/claim:",
    "/api/founderos/orchestrate/jobs/{job_id}/heartbeat:",
    "/api/founderos/orchestrate/jobs/{job_id}/complete:",
    "/api/founderos/orchestrate/jobs/{job_id}/fail:",
  ]) {
    assert.doesNotMatch(openapi, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("health handler matches the documented shape", async () => {
  const response = await invoke(healthHandler, { method: "GET", headers: {} });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(response.json).sort(), [
    "ok",
    "runtime",
    "service",
    "timestamp",
    "version",
  ]);
  assert.equal(response.json.ok, true);
  assert.equal(typeof response.json.runtime, "object");
});

test("capabilities is public and returns the governed public APS endpoints", async () => {
  process.env.ALLOWED_REPOS = "owner/repo";
  process.env.FOUNDEROS_WORKER_KEY = "worker-key";

  const response = await invoke(capabilitiesHandler, { method: "GET", headers: {} });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.endpoints.length, 11);
  assert.equal(response.json.openapi.path, "docs/openapi.founderos.yaml");
  assert.equal(response.json.worker_auth.header, "x-founderos-worker-key");
  assert.equal(typeof response.json.runtime, "object");
  assert.deepEqual(
    response.json.endpoints.map((item) => item.path),
    [
      "/api/founderos/health",
      "/api/founderos/capabilities",
      "/api/founderos/capabilities/check",
      "/api/founderos/precommit/plan",
      "/api/founderos/repo/file",
      "/api/founderos/repo/tree",
      "/api/founderos/commit/freeze-write-set",
      "/api/founderos/commit/execute",
      "/api/founderos/commit/merge-pr",
      "/api/founderos/orchestrate/submit",
      "/api/founderos/orchestrate/jobs/{job_id}",
    ]
  );
  assert.equal(response.json.boundaries.governed_pr_merge_available, true);
  assert.equal(response.json.boundaries.policy_bearing_artifact_classification, true);
  assert.equal(response.json.boundaries.deterministic_mutation_translation_required, true);
  assert.ok(
    response.json.policy_bearing_artifacts.some(
      (item) =>
        item.path === "memory/decisions/" &&
        item.artifact_type === "authority_shaping_decision_artifact" &&
        item.enforcement === "review_required"
    )
  );
});

test("capabilities continues to work when auth headers are present", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";

  const response = await invoke(capabilitiesHandler, {
    method: "GET",
    headers: { authorization: "Bearer test-key" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
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
  assert.equal(authorized.json.endpoints.length, 11);
  assert.equal(authorized.json.endpoints[2].path, "/api/founderos/capabilities/check");
});

test("orchestrate.submit fails closed when Supabase storage is not configured", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const response = await invoke(orchestrateSubmitHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    body: {
      user_request: "Inspect the repo and prepare a PR plan",
      scope: { repo: "owner/repo", branch: "main" },
    },
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.json.error, "orchestration_not_configured");
});

test("orchestrate job status requires a job id", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";

  const response = await invoke(orchestrateJobStatusHandler, {
    method: "GET",
    headers: { "x-founderos-key": "test-key" },
    query: {},
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json.error, "job_id_required");
});

test("worker claim requires the worker key", async () => {
  process.env.FOUNDEROS_WORKER_KEY = "worker-key";

  const response = await invoke(orchestrateClaimHandler, {
    method: "POST",
    headers: {},
    body: {},
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json.error, "worker_unauthorized");
});

