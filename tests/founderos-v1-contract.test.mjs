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
const repoFileHandler = require("../api/founderos/repo/file.js");
const repoTreeHandler = require("../api/founderos/repo/tree.js");
const freezeWriteSetHandler = require("../api/founderos/commit/freeze-write-set.js");
const commitExecuteHandler = require("../api/founderos/commit/execute.js");
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
    /servers:\s*\n\s*- url: https:\/\/founderos-alpha\.vercel\.app\s*\nsecurity:\s*\n\s*- FounderosApiKey: \[\]/
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
  assert.deepEqual(Object.keys(response.json).sort(), ["ok", "service", "timestamp", "version"]);
  assert.equal(response.json.ok, true);
});

test("capabilities is public and returns only the nine public APS endpoints", async () => {
  process.env.ALLOWED_REPOS = "owner/repo";
  process.env.FOUNDEROS_WORKER_KEY = "worker-key";

  const response = await invoke(capabilitiesHandler, { method: "GET", headers: {} });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.endpoints.length, 10);
  assert.equal(response.json.openapi.path, "docs/openapi.founderos.yaml");
  assert.equal(response.json.worker_auth.header, "x-founderos-worker-key");
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
      "/api/founderos/orchestrate/submit",
      "/api/founderos/orchestrate/jobs/{job_id}",
    ]
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
  assert.equal(authorized.json.endpoints.length, 10);
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

test("commit.auto-execute requires the worker key", async () => {
  process.env.FOUNDEROS_WORKER_KEY = "worker-key";

  const response = await invoke(commitAutoExecuteHandler, {
    method: "POST",
    headers: {},
    body: {},
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json.error, "worker_unauthorized");
});

test("commit.freeze-write-set fails closed when artifact storage is not configured", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.ALLOWED_REPOS = "owner/repo";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const response = await invoke(freezeWriteSetHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    body: {
      write_set: {
        branch_name: "codex/frozen-test",
        base_branch: "main",
        title: "Freeze test",
        repo: "owner/repo",
        files: [
          {
            path: "docs/frozen.md",
            action: "create",
            content: "hello",
          },
        ],
      },
      plan_artifact_id: "plan_123",
      plan_artifact_hash: "plan_hash",
      frozen_by: "tester",
    },
  });

  assert.equal(response.statusCode, 500);
  assert.equal(response.json.error, "artifact_store_not_configured");
});

test("commit.auto-execute rejects non-doc paths", async () => {
  process.env.FOUNDEROS_WORKER_KEY = "worker-key";
  process.env.ALLOWED_REPOS = "owner/repo";

  const writeSet = {
    branch_name: "codex/test-docs-only",
    base_branch: "main",
    title: "Test auto execute",
    repo: "owner/repo",
    files: [
      {
        path: "services/openclaw/worker-loop.sh",
        action: "update",
        content: "echo nope",
      },
    ],
  };

  const response = await invoke(commitAutoExecuteHandler, {
    method: "POST",
    headers: { "x-founderos-worker-key": "worker-key" },
    body: {
      write_set: writeSet,
      candidate: {
        mode: "exact_write_set_candidate",
        title: "Unsafe candidate",
      },
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "auto_execute_docs_only");
});

test("repo.file rejects repos outside the allowlist before external calls", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.ALLOWED_REPOS = "owner/repo";

  const response = await invoke(repoFileHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    body: {
      repo: "other/repo",
      path: "README.md",
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "repo_not_allowed");
});

test("repo.tree validates limit input before external calls", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.ALLOWED_REPOS = "owner/repo";

  const response = await invoke(repoTreeHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    body: {
      repo: "owner/repo",
      limit: "abc",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json.error, "limit_invalid");
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

test("worker recommendation freshness avoids repeating already-landed docs fixes", async () => {
  const workerLoop = await readFile(
    new URL("../services/openclaw/worker-loop.sh", import.meta.url),
    "utf8"
  );

  const { hasLiveWorkerAuthMarkers, buildImprovementProposal } =
    extractWorkerFreshnessHelpers(workerLoop);

  const activationText = [
    "# OpenClaw APS Activation",
    "- OpenClaw uses `FOUNDEROS_WORKER_KEY` for worker-only orchestration claim, heartbeat, complete, and fail calls.",
    "Worker claim check:",
    "bash services/openclaw/aps-client.sh claim",
    "Async job verification includes heartbeat updates.",
  ].join("\n");

  assert.equal(hasLiveWorkerAuthMarkers(activationText), true);

  const proposal = buildImprovementProposal({
    repo: "owner/repo",
    activationText,
    desiredActivationDoc: "unused in freshness path",
  });

  assert.equal(
    proposal.title,
    "Tighten worker recommendation freshness and add regression coverage"
  );
  assert.deepEqual(proposal.target_files, [
    "services/openclaw/worker-loop.sh",
    "tests/founderos-v1-contract.test.mjs",
  ]);
  assert.equal(proposal.candidate_write_set.files.length, 2);
  assert.equal(
    proposal.candidate_write_set.files[0].path,
    "services/openclaw/worker-loop.sh"
  );
  assert.equal(
    proposal.candidate_write_set.files[1].path,
    "tests/founderos-v1-contract.test.mjs"
  );
});

test("large write sets can be frozen and executed from server-canonical payloads", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.ALLOWED_REPOS = "owner/repo";
  process.env.GITHUB_APP_ID = "123";
  process.env.GITHUB_INSTALLATION_ID = "456";
  process.env.GITHUB_APP_PRIVATE_KEY = "test-private-key";
  process.env.SUPABASE_URL = "https://supabase.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

  const storage = {
    plan_artifacts: [],
    witness_events: [],
  };
  const githubCalls = [];

  const supabaseMock = {
    buildWitnessEvent(type, actor, payload, artifactId, commitId) {
      return {
        id: `witness-${storage.witness_events.length + 1}`,
        ts: new Date().toISOString(),
        type,
        commit_id: commitId || null,
        artifact_id: artifactId || null,
        actor,
        payload,
      };
    },
    getSupabaseConfig() {
      return { url: "https://supabase.example", serviceRoleKey: "service-role-key" };
    },
    async insertRow(_config, table, row) {
      storage[table].push(row);
      return row;
    },
    async selectRows(_config, table, filters) {
      const rows = storage[table] || [];
      return rows.filter((row) => {
        return Object.entries(filters || {}).every(([key, value]) => {
          if (typeof value === "string" && value.startsWith("eq.")) {
            return row[key] === value.slice(3);
          }
          return row[key] === value;
        });
      });
    },
  };

  const githubMock = {
    encodePathForGitHub(path) {
      return path.split("/").map(encodeURIComponent).join("/");
    },
    async getInstallationToken() {
      assert.ok(
        storage.witness_events.some((row) => row.type === "commit.execution_authorized")
      );
      return "installation-token";
    },
    async githubRequest(_token, method, path, body) {
      githubCalls.push({ method, path, body });
      if (method === "GET" && path.includes("/git/ref/heads/")) {
        return { object: { sha: "base-sha" } };
      }
      if (method === "POST" && path.endsWith("/git/refs")) {
        return { ref: body.ref, object: { sha: body.sha } };
      }
      if (method === "PUT" && path.includes("/contents/")) {
        return { content: { path } };
      }
      if (method === "POST" && path.endsWith("/pulls")) {
        return { html_url: "https://github.com/owner/repo/pull/99", number: 99 };
      }
      throw new Error(`unexpected github request: ${method} ${path}`);
    },
  };

  const commitExecution = loadFreshCommonJs("../api/_lib/commit-execution.js", {
    "../api/_lib/supabase.js": supabaseMock,
    "../api/_lib/github.js": githubMock,
  });
  const freshFreezeHandler = loadFreshCommonJs("../api/founderos/commit/freeze-write-set.js", {
    "../api/_lib/commit-execution.js": commitExecution,
  });
  const freshCommitExecuteHandler = loadFreshCommonJs("../api/founderos/commit/execute.js", {
    "../api/_lib/commit-execution.js": commitExecution,
  });

  const largeContent = `# Large Patch\n\n${"payload-line\n".repeat(4000)}`;
  const writeSet = {
    branch_name: "codex/large-server-frozen-patch",
    base_branch: "main",
    title: "Large frozen patch",
    repo: "owner/repo",
    files: [
      {
        path: "docs/large-frozen-patch.md",
        action: "create",
        content: largeContent,
      },
    ],
  };

  const freezeResponse = await invoke(freshFreezeHandler, {
    method: "POST",
    headers: { authorization: "Bearer test-key" },
    body: {
      write_set: writeSet,
      plan_artifact_id: "plan_large_123",
      plan_artifact_hash: "plan_hash_large_123",
      frozen_by: "tester",
    },
  });

  assert.equal(freezeResponse.statusCode, 200);
  assert.equal(freezeResponse.json.ok, true);
  assert.equal(freezeResponse.json.artifact.write_set_hash, createHash("sha256").update(JSON.stringify(writeSet)).digest("hex"));

  const executeResponse = await invoke(freshCommitExecuteHandler, {
    method: "POST",
    headers: { authorization: "Bearer test-key" },
    body: {
      authorization: {
        plan_artifact_id: "plan_large_123",
        plan_artifact_hash: "plan_hash_large_123",
        frozen_write_set_artifact_id: freezeResponse.json.artifact.id,
        frozen_write_set_artifact_hash: freezeResponse.json.artifact.content_hash,
        authorized_by: "tester",
      },
    },
  });

  assert.equal(executeResponse.statusCode, 200);
  assert.equal(executeResponse.json.ok, true);
  assert.equal(executeResponse.json.execution.repo, "owner/repo");
  assert.equal(executeResponse.json.execution.files_written, 1);
  assert.equal(
    executeResponse.json.execution.write_set_hash,
    freezeResponse.json.artifact.write_set_hash
  );
  assert.equal(executeResponse.json.execution.pr_number, 99);
  assert.ok(
    storage.witness_events.some((row) => row.type === "commit.write_set_frozen")
  );
  assert.ok(
    storage.witness_events.some((row) => row.type === "commit.execution_authorized")
  );
  assert.ok(
    githubCalls.some((call) => call.method === "POST" && call.path.endsWith("/pulls"))
  );
});
