import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildPlanArtifact } = require("../api/_lib/founderos-v1.js");
const { normalizeSubmitBody } = require("../api/_lib/orchestration.js");

const healthHandler = require("../api/founderos/health.js");
const capabilitiesHandler = require("../api/founderos/capabilities.js");
const capabilitiesCheckHandler = require("../api/founderos/capabilities/check.js");
const orchestrateSubmitHandler = require("../api/founderos/orchestrate/submit.js");
const orchestrateJobStatusHandler = require("../api/founderos/orchestrate/jobs/[job_id].js");
const orchestrateClaimHandler = require("../api/founderos/orchestrate/claim.js");
const tradingConnectorsHealthHandler = require("../api/founderos/trading/connectors/health.js");

const EXPECTED_PUBLIC_ENDPOINTS = [
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
  "/api/founderos/trading/candidates",
  "/api/founderos/trading/candidates/{candidate_id}",
  "/api/founderos/trading/candidates/{candidate_id}/decision",
  "/api/founderos/trading/journal",
  "/api/founderos/trading/backtests/{run_id}",
  "/api/founderos/trading/connectors/health",
];

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

function extractWorkerHelpers(source) {
  const markerStart = source.indexOf("function hasLiveWorkerAuthMarkers");
  const markerEnd = source.indexOf("const taskKind = normalizeTaskKind");

  assert.notEqual(markerStart, -1);
  assert.notEqual(markerEnd, -1);

  const helperSource = source.slice(markerStart, markerEnd);
  const factory = new Function(
    `${helperSource}\nreturn { hasLiveWorkerAuthMarkers, inferLane, normalizeTaskKind, buildBootstrapProposal, buildTradingProposal, buildWorkerProposal, buildStructuredOutput };`
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

test("worker helpers detect live worker-auth markers", async () => {
  const source = await readFile(
    new URL("../services/openclaw/worker-loop.sh", import.meta.url),
    "utf8"
  );
  const { hasLiveWorkerAuthMarkers } = extractWorkerHelpers(source);

  assert.equal(hasLiveWorkerAuthMarkers("FOUNDEROS_WORKER_KEY\nclaim\nheartbeat"), true);
  assert.equal(hasLiveWorkerAuthMarkers("FOUNDEROS_WORKER_KEY\nclaim"), false);
});

test("worker normalizes trading and bootstrap task kinds", async () => {
  const source = await readFile(
    new URL("../services/openclaw/worker-loop.sh", import.meta.url),
    "utf8"
  );
  const { normalizeTaskKind } = extractWorkerHelpers(source);

  assert.equal(
    normalizeTaskKind("", "Research a BTC/USD Alpaca paper trading loop", "paper-trading-loop"),
    "trading_research"
  );
  assert.equal(
    normalizeTaskKind("trading_sync", "Anything", "paper-trading-loop"),
    "trading_sync"
  );
  assert.equal(
    normalizeTaskKind("", "Inspect the repo and improve worker docs", "founderos"),
    "bootstrap_self_improvement"
  );
});

test("worker preserves bootstrap inspect-and-propose behavior only for explicit bootstrap jobs", async () => {
  const source = await readFile(
    new URL("../services/openclaw/worker-loop.sh", import.meta.url),
    "utf8"
  );
  const { buildWorkerProposal } = extractWorkerHelpers(source);

  const proposal = buildWorkerProposal({
    repo: "andysalvo/founderos",
    taskKind: "bootstrap_self_improvement",
    activationText: "FOUNDEROS_WORKER_KEY\nclaim\nheartbeat\ncomplete\nfail",
    desiredActivationDoc: "placeholder",
  });

  assert.equal(proposal.kind, "safe_improvement_proposal");
  assert.equal(
    proposal.title,
    "Upgrade the worker from inspect-and-report to inspect-and-propose"
  );
  assert.equal(
    proposal.candidate_write_set.branch_name,
    "codex/worker-inspect-and-propose-contract"
  );
});

test("worker falls back to bootstrap docs alignment when activation markers are absent", async () => {
  const source = await readFile(
    new URL("../services/openclaw/worker-loop.sh", import.meta.url),
    "utf8"
  );
  const { buildBootstrapProposal } = extractWorkerHelpers(source);

  const proposal = buildBootstrapProposal({
    repo: "andysalvo/founderos",
    activationText: "FOUNDEROS_PUBLIC_WRITE_KEY\nsubmit\njob-status",
    desiredActivationDoc: "updated activation doc",
  });

  assert.equal(proposal.kind, "docs_alignment");
  assert.equal(
    proposal.candidate_write_set.branch_name,
    "codex/update-worker-activation-docs"
  );
});

test("worker returns a trading-specific proposal for paper-trading-loop jobs", async () => {
  const source = await readFile(
    new URL("../services/openclaw/worker-loop.sh", import.meta.url),
    "utf8"
  );
  const { buildWorkerProposal } = extractWorkerHelpers(source);

  const proposal = buildWorkerProposal({
    repo: "andysalvo/founderos",
    projectSlug: "paper-trading-loop",
    taskKind: "trading_research",
    provider: "alpaca",
    executionMode: "paper",
    strategyName: "btc_usd_breakout_v1",
    asset: "BTC/USD",
    timeframe: "15m",
    anchorDocs: [{ path: "projects/paper-trading-loop/README.md", content: "# Paper Trading Loop" }],
  });

  assert.equal(proposal.kind, "trading_lane_proposal");
  assert.equal(
    proposal.title,
    "Advance the APS-centered trading research and object model contract"
  );
  assert.equal(
    proposal.candidate_write_set.branch_name,
    "codex/aps-trading-research-contract"
  );
  assert.ok(
    proposal.target_files.includes("projects/paper-trading-loop/research/trading-agent-research-notes.md")
  );
  assert.deepEqual(proposal.strategy_profile, {
    provider: "alpaca",
    execution_mode: "paper",
    strategy_name: "btc_usd_breakout_v1",
    asset: "BTC/USD",
    timeframe: "15m",
  });
});

test("worker builds trading structured output with project anchors loaded", async () => {
  const source = await readFile(
    new URL("../services/openclaw/worker-loop.sh", import.meta.url),
    "utf8"
  );
  const { buildWorkerProposal, buildStructuredOutput } = extractWorkerHelpers(source);

  const proposal = buildWorkerProposal({
    repo: "andysalvo/founderos",
    projectSlug: "paper-trading-loop",
    taskKind: "trading_research",
    provider: "alpaca",
    executionMode: "paper",
    strategyName: "btc_usd_breakout_v1",
    asset: "BTC/USD",
    timeframe: "15m",
    anchorDocs: [{ path: "projects/paper-trading-loop/README.md", content: "# Paper Trading Loop" }],
  });

  const structured = buildStructuredOutput({
    job: { id: "job-123" },
    repo: "andysalvo/founderos",
    projectSlug: "paper-trading-loop",
    taskKind: "trading_research",
    objective: "Research the paper-trading-loop and Alpaca paper execution path",
    topPaths: ["README.md", "services/openclaw/worker-loop.sh"],
    activeSurface: ["/api/founderos/health", "/api/founderos/trading/candidates"],
    workerProposal: proposal,
    anchorDocs: [{ path: "projects/paper-trading-loop/README.md", content: "# Paper Trading Loop" }],
  });

  assert.equal(structured.task_family, "trading");
  assert.equal(structured.task_kind, "trading_research");
  assert.equal(structured.project_slug, "paper-trading-loop");
  assert.equal(structured.lane, "trading");
  assert.equal(structured.status, "completed");
  assert.equal(structured.anchor_paths_loaded.length, 1);
  assert.equal(structured.ledger_entry_stub.job_id, "job-123");
});

test("buildPlanArtifact preserves trading scope and intended tools", () => {
  const artifact = buildPlanArtifact(
    "Backtest BTC/USD Alpaca strategy and define the paper execution path",
    {
      repo: "owner/repo",
      branch: "main",
      project_slug: "paper-trading-loop",
      task_kind: "trading_backtest",
      anchor_paths: ["projects/paper-trading-loop/README.md"],
      provider: "alpaca",
      execution_mode: "paper",
      strategy_name: "btc_usd_breakout_v1",
      asset: "BTC/USD",
      timeframe: "15m",
    },
    []
  );

  assert.equal(artifact.scope.project_slug, "paper-trading-loop");
  assert.equal(artifact.scope.task_kind, "trading_backtest");
  assert.deepEqual(artifact.scope.anchor_paths, ["projects/paper-trading-loop/README.md"]);
  assert.equal(artifact.scope.provider, "alpaca");
  assert.equal(artifact.scope.execution_mode, "paper");
  assert.equal(artifact.scope.strategy_name, "btc_usd_breakout_v1");
  assert.equal(artifact.scope.asset, "BTC/USD");
  assert.equal(artifact.scope.timeframe, "15m");
  assert.ok(artifact.intended_tools.some((item) => item.name === "trading-research"));
});

test("normalizeSubmitBody backfills trading scope when GPT sends a thin paper-trading request", () => {
  const normalized = normalizeSubmitBody({
    user_request:
      "Inspect the repo and build the Alpaca paper crypto trading loop for paper-trading-loop.",
    scope: {
      repo: "andysalvo/founderos",
      branch: "main",
      project_slug: "",
      task_kind: "",
      anchor_paths: [],
      provider: "",
      execution_mode: "",
      strategy_name: "",
      asset: "",
      timeframe: "",
    },
  });

  assert.equal(normalized.scope.project_slug, "paper-trading-loop");
  assert.equal(normalized.scope.task_kind, "trading_research");
  assert.equal(normalized.scope.provider, "alpaca");
  assert.equal(normalized.scope.execution_mode, "paper");
  assert.equal(normalized.scope.strategy_name, "btc_usd_breakout_v1");
  assert.equal(normalized.scope.asset, "BTC/USD");
  assert.equal(normalized.scope.timeframe, "15m");
  assert.ok(normalized.scope.anchor_paths.length > 0);
  assert.ok(normalized.scope.allowed_paths.length > 0);
});

test("worker check script verifies trading-specific smoke inputs and outputs", async () => {
  const script = await readFile(
    new URL("../services/openclaw/check-worker.sh", import.meta.url),
    "utf8"
  );

  assert.match(script, /LOCAL_COMMIT_SHA=/);
  assert.match(script, /trading-connectors-health/);
  assert.match(script, /submit-json/);
  assert.match(script, /project_slug: "paper-trading-loop"/);
  assert.match(script, /task_kind: "trading_research"/);
  assert.match(script, /anchor_paths_loaded/);
  assert.match(script, /worker contract verified/);
});

test("worker reconcile script can fetch, restart, and invoke the trading contract check", async () => {
  const script = await readFile(
    new URL("../services/openclaw/reconcile-worker.sh", import.meta.url),
    "utf8"
  );

  assert.match(script, /--fetch/);
  assert.match(script, /git fetch --all --prune/);
  assert.match(script, /--restart/);
  assert.match(script, /systemctl restart/);
  assert.match(script, /APS-centered trading research contract/);
  assert.match(script, /services\/openclaw\/check-worker\.sh/);
});

test("OpenAPI surface exposes only the public APS contract including trading routes", async () => {
  const openapi = await readFile(new URL("../docs/openapi.founderos.yaml", import.meta.url), "utf8");

  assert.match(openapi, /https:\/\/founderos-alpha\.vercel\.app/);
  assert.match(
    openapi,
    /servers:\s*\n\s*- url: https:\/\/founderos-alpha\.vercel.app\s*\nsecurity:\s*\n\s*- FounderosApiKey: \[\]/
  );

  for (const path of EXPECTED_PUBLIC_ENDPOINTS.map((item) => `${item}:`)) {
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
  assert.equal(response.json.endpoints.length, EXPECTED_PUBLIC_ENDPOINTS.length);
  assert.equal(response.json.openapi.path, "docs/openapi.founderos.yaml");
  assert.equal(response.json.worker_auth.header, "x-founderos-worker-key");
  assert.equal(typeof response.json.runtime, "object");
  assert.deepEqual(
    response.json.endpoints.map((item) => item.path),
    EXPECTED_PUBLIC_ENDPOINTS
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
  assert.equal(authorized.json.endpoints.length, EXPECTED_PUBLIC_ENDPOINTS.length);
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
      user_request: "Inspect the repo and prepare a trading research plan",
      scope: {
        repo: "owner/repo",
        branch: "main",
        project_slug: "paper-trading-loop",
        task_kind: "trading_research",
      },
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

test("worker APS client fails closed on lifecycle HTTP errors and exposes trading helpers", async () => {
  const client = await readFile(
    new URL("../services/openclaw/aps-client.sh", import.meta.url),
    "utf8"
  );

  assert.match(client, /worker_lifecycle_curl=\(curl --fail-with-body -sS\)/);
  assert.match(client, /submit-json/);
  assert.match(client, /trading-connectors-health/);
  assert.match(client, /claim\)[\s\S]*worker_lifecycle_curl/);
  assert.match(client, /heartbeat\)[\s\S]*worker_lifecycle_curl/);
  assert.match(client, /complete\)[\s\S]*worker_lifecycle_curl/);
  assert.match(client, /fail\)[\s\S]*worker_lifecycle_curl/);
});

test("complete and fail handlers pass compact lifecycle metadata into orchestration events", async () => {
  process.env.FOUNDEROS_WORKER_KEY = "worker-key";

  let completedPayload = null;
  let failedPayload = null;

  const orchestrationMock = {
    async updateJobLifecycle(_jobId, _workerId, nextStatus, payload) {
      if (nextStatus === "completed") {
        completedPayload = payload;
      } else if (nextStatus === "failed") {
        failedPayload = payload;
      }

      return { id: "job-123", status: nextStatus };
    },
  };

  const freshCompleteHandler = loadFreshCommonJs(
    "../api/founderos/orchestrate/jobs/[job_id]/complete.js",
    {
      "../api/_lib/orchestration.js": orchestrationMock,
    }
  );
  const freshFailHandler = loadFreshCommonJs("../api/founderos/orchestrate/jobs/[job_id]/fail.js", {
    "../api/_lib/orchestration.js": orchestrationMock,
  });

  const sharedBody = {
    result: {
      summary: "done",
      suggested_next_improvement: {
        title: "large result blob should stay in result_json only",
      },
    },
    worker_runtime: {
      worker_id: "openclaw-worker",
      worker_commit_sha: "c".repeat(40),
    },
    model_identity: "gpt-5",
    policy_verdict: {
      checks_green: true,
    },
  };

  const completeResponse = await invoke(freshCompleteHandler, {
    method: "POST",
    headers: { "x-founderos-worker-key": "worker-key", "x-founderos-worker-id": "openclaw-worker" },
    query: { job_id: "job-123" },
    body: sharedBody,
  });
  const failResponse = await invoke(freshFailHandler, {
    method: "POST",
    headers: { "x-founderos-worker-key": "worker-key", "x-founderos-worker-id": "openclaw-worker" },
    query: { job_id: "job-123" },
    body: sharedBody,
  });

  assert.equal(completeResponse.statusCode, 200);
  assert.equal(failResponse.statusCode, 200);
  assert.deepEqual(completedPayload.event_payload, {
    status: "completed",
    result_present: true,
    policy_verdict_present: true,
    worker_runtime_present: true,
  });
  assert.deepEqual(failedPayload.event_payload, {
    status: "failed",
    result_present: true,
    policy_verdict_present: true,
    worker_runtime_present: true,
  });
  assert.deepEqual(completedPayload.result, sharedBody.result);
  assert.deepEqual(failedPayload.result, sharedBody.result);
});

test("trading candidates route lists candidates from the APS trading helper", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";

  const candidatesHandler = loadFreshCommonJs("../api/founderos/trading/candidates.js", {
    "../api/_lib/trading.js": {
      async listTradeCandidates() {
        return [{ id: "cand-1", asset: "BTC/USD", status: "proposed" }];
      },
    },
  });

  const response = await invoke(candidatesHandler, {
    method: "GET",
    headers: { "x-founderos-key": "test-key" },
    query: {},
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
  assert.deepEqual(response.json.candidates, [{ id: "cand-1", asset: "BTC/USD", status: "proposed" }]);
});

test("trading candidate route reads one candidate record", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";

  const candidateHandler = loadFreshCommonJs(
    "../api/founderos/trading/candidates/[candidate_id].js",
    {
      "../api/_lib/trading.js": {
        async getTradeCandidate(candidateId) {
          return {
            candidate: { id: candidateId, asset: "BTC/USD", status: "approved" },
            decisions: [],
            orders: [],
          };
        },
      },
    }
  );

  const response = await invoke(candidateHandler, {
    method: "GET",
    headers: { "x-founderos-key": "test-key" },
    query: { candidate_id: "cand-1" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.candidate.id, "cand-1");
  assert.equal(response.json.candidate.asset, "BTC/USD");
});

test("trading decision route records an approval decision", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";

  const decisionHandler = loadFreshCommonJs(
    "../api/founderos/trading/candidates/[candidate_id]/decision.js",
    {
      "../api/_lib/trading.js": {
        async decideTradeCandidate(candidateId, body) {
          return {
            candidate: { id: candidateId, status: "approved" },
            decision: { id: "decision-1", decision: body.decision, decided_by: body.authorized_by },
            live_authority_state: { stage: "paper_only", enabled: false },
          };
        },
      },
    }
  );

  const response = await invoke(decisionHandler, {
    method: "POST",
    headers: { "x-founderos-key": "test-key" },
    query: { candidate_id: "cand-1" },
    body: {
      decision: "approve",
      authorized_by: "andy",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.candidate.status, "approved");
  assert.equal(response.json.decision.decision, "approve");
  assert.equal(response.json.live_authority_state.stage, "paper_only");
});

test("trading journal route lists journal entries from the APS trading helper", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";

  const journalHandler = loadFreshCommonJs("../api/founderos/trading/journal.js", {
    "../api/_lib/trading.js": {
      async listTradeJournal() {
        return [{ id: "journal-1", asset: "BTC/USD", status: "closed_paper" }];
      },
    },
  });

  const response = await invoke(journalHandler, {
    method: "GET",
    headers: { "x-founderos-key": "test-key" },
    query: {},
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
  assert.deepEqual(response.json.entries, [
    { id: "journal-1", asset: "BTC/USD", status: "closed_paper" },
  ]);
});

test("trading backtest route reads one evaluation run", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";

  const backtestHandler = loadFreshCommonJs(
    "../api/founderos/trading/backtests/[run_id].js",
    {
      "../api/_lib/trading.js": {
        async getBacktestRun(runId) {
          return { id: runId, strategy_name: "btc_usd_breakout_v1", pbo: 0.1 };
        },
      },
    }
  );

  const response = await invoke(backtestHandler, {
    method: "GET",
    headers: { "x-founderos-key": "test-key" },
    query: { run_id: "run-1" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.run.id, "run-1");
  assert.equal(response.json.run.strategy_name, "btc_usd_breakout_v1");
});

test("trading connectors health route reports APS-owned connector readiness", async () => {
  process.env.FOUNDEROS_WRITE_KEY = "test-key";
  process.env.ALPACA_PAPER_API_KEY = "paper-key";
  process.env.ALPACA_PAPER_SECRET_KEY = "paper-secret";
  process.env.FOUNDEROS_LIVE_AUTHORITY_STAGE = "paper_only";

  const response = await invoke(tradingConnectorsHealthHandler, {
    method: "GET",
    headers: { "x-founderos-key": "test-key" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.live_authority_state.stage, "paper_only");
  assert.ok(
    response.json.connectors.some(
      (item) =>
        item.provider === "alpaca" &&
        item.role === "broker" &&
        item.mode === "paper" &&
        item.status === "configured"
    )
  );
});
