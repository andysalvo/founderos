const { randomUUID } = require("crypto");
const {
  buildPlanArtifact,
  hashJson,
  isPlainObject,
  normalizeStringList,
  normalizeScope,
  validateModelIdentity,
  validateMutationText,
} = require("./founderos-v1");
const {
  buildWitnessEvent,
  getSupabaseConfig,
  insertRow,
  insertRows,
  patchRows,
  selectRows,
} = require("./supabase");
const { getRuntimeContext } = require("./runtime");

const ACTIVE_JOB_STATUSES = new Set([
  "queued",
  "claimed",
  "inspecting",
  "planning",
  "write_set_ready",
  "executing",
  "completed",
  "failed",
  "blocked",
]);

const DEFAULT_TRADING_ANCHOR_PATHS = [
  "projects/paper-trading-loop/README.md",
  "projects/paper-trading-loop/alpaca-paper-mvp.md",
  "projects/paper-trading-loop/paper-first-architecture.md",
  "projects/paper-trading-loop/risk-rules.md",
  "projects/paper-trading-loop/journal-schema.md",
  "projects/paper-trading-loop/first-strategy.md",
  "projects/paper-trading-loop/authority-boundary.md",
  "projects/paper-trading-loop/research/trading-agent-research-notes.md",
  "projects/paper-trading-loop/trading-object-model.md",
  "docs/governance/CONSTITUTION.md",
];

const DEFAULT_TRADING_ALLOWED_PATHS = [
  "projects/paper-trading-loop/**",
  "services/openclaw/**",
  "api/founderos/**",
  "api/_lib/**",
  "infra/supabase/**",
  "tests/**",
  "docs/**",
];

function requireSupabaseConfig() {
  return getSupabaseConfig();
}

function sanitizeWorkerRuntime(raw) {
  if (!isPlainObject(raw)) {
    return null;
  }

  const workerId =
    typeof raw.worker_id === "string" && raw.worker_id.trim() ? raw.worker_id.trim() : null;
  const workerCommitSha =
    typeof raw.worker_commit_sha === "string" && /^[a-f0-9]{7,64}$/i.test(raw.worker_commit_sha.trim())
      ? raw.worker_commit_sha.trim()
      : null;
  const workerCommitSource =
    typeof raw.worker_commit_source === "string" && raw.worker_commit_source.trim()
      ? raw.worker_commit_source.trim()
      : null;
  const workerVersion =
    typeof raw.worker_version === "string" && raw.worker_version.trim()
      ? raw.worker_version.trim()
      : null;

  if (!workerId && !workerCommitSha && !workerCommitSource && !workerVersion) {
    return null;
  }

  return {
    worker_id: workerId,
    worker_commit_sha: workerCommitSha,
    worker_commit_source: workerCommitSource,
    worker_version: workerVersion,
  };
}

function buildWitnessContentHash(row) {
  return hashJson({
    ts: row.ts,
    type: row.type,
    commit_id: row.commit_id,
    artifact_id: row.artifact_id,
    actor: row.actor,
    payload: row.payload,
  });
}

function buildOrchestrationWitness(type, actor, artifactId, payload) {
  const row = buildWitnessEvent(type, actor, payload, artifactId || null, null);
  row.content_hash = buildWitnessContentHash(row);
  return row;
}

function looksLikeTradingRequest(userRequest, scope) {
  const text = typeof userRequest === "string" ? userRequest.toLowerCase() : "";
  const scoped = isPlainObject(scope) ? scope : {};
  return (
    scoped.project_slug === "paper-trading-loop" ||
    (typeof scoped.task_kind === "string" && scoped.task_kind.startsWith("trading_")) ||
    typeof scoped.provider === "string" && scoped.provider.trim().toLowerCase() === "alpaca" ||
    [
      "alpaca",
      "paper trading",
      "paper-trading",
      "crypto",
      "btc",
      "eth",
      "sol",
      "trading",
      "backtest",
      "strategy",
      "broker",
    ].some((needle) => text.includes(needle))
  );
}

function inferTradingTaskKind(userRequest, scope) {
  const existing = typeof scope.task_kind === "string" ? scope.task_kind.trim() : "";
  if (existing.startsWith("trading_")) {
    return existing;
  }

  const text = typeof userRequest === "string" ? userRequest.toLowerCase() : "";
  if (text.includes("live stage") || text.includes("canary")) {
    return "trading_live_stage";
  }
  if (text.includes("live execute") || text.includes("autonomous live")) {
    return "trading_live_execute";
  }
  if (
    text.includes("sync") ||
    text.includes("reconcile") ||
    text.includes("recovery") ||
    text.includes("restart") ||
    text.includes("health")
  ) {
    return "trading_sync";
  }
  if (
    text.includes("paper execute") ||
    text.includes("paper order") ||
    text.includes("approval") ||
    text.includes("approve") ||
    text.includes("decision")
  ) {
    return "trading_paper_execute";
  }
  if (
    text.includes("shadow") ||
    text.includes("candidate") ||
    text.includes("signal") ||
    text.includes("scan")
  ) {
    return "trading_shadow_scan";
  }
  if (
    text.includes("backtest") ||
    text.includes("evaluation") ||
    text.includes("pbo") ||
    text.includes("dsr")
  ) {
    return "trading_backtest";
  }
  return "trading_research";
}

function inferTradingAsset(userRequest, scope) {
  if (scope.asset) {
    return scope.asset;
  }

  const text = typeof userRequest === "string" ? userRequest.toLowerCase() : "";
  if (text.includes("eth")) {
    return "ETH/USD";
  }
  if (text.includes("sol")) {
    return "SOL/USD";
  }
  return "BTC/USD";
}

function inferTradingTimeframe(userRequest, scope) {
  if (scope.timeframe) {
    return scope.timeframe;
  }

  const text = typeof userRequest === "string" ? userRequest.toLowerCase() : "";
  if (text.includes("1h") || text.includes("60m")) {
    return "1h";
  }
  if (text.includes("5m")) {
    return "5m";
  }
  return "15m";
}

function normalizeSubmitScope(userRequest, rawScope) {
  const scope = normalizeScope(rawScope);
  if (!looksLikeTradingRequest(userRequest, rawScope)) {
    return scope;
  }

  return {
    ...scope,
    project_slug: scope.project_slug || "paper-trading-loop",
    task_kind: inferTradingTaskKind(userRequest, scope),
    anchor_paths: scope.anchor_paths.length ? scope.anchor_paths : DEFAULT_TRADING_ANCHOR_PATHS,
    provider: scope.provider || "alpaca",
    execution_mode: scope.execution_mode || "paper",
    strategy_name: scope.strategy_name || "btc_usd_breakout_v1",
    asset: inferTradingAsset(userRequest, scope),
    timeframe: inferTradingTimeframe(userRequest, scope),
    allowed_paths: scope.allowed_paths.length ? scope.allowed_paths : DEFAULT_TRADING_ALLOWED_PATHS,
  };
}

function normalizeSubmitBody(body) {
  const payload = isPlainObject(body) ? body : {};
  const userRequest =
    typeof payload.user_request === "string" ? payload.user_request.trim() : "";
  const scope = normalizeSubmitScope(userRequest, payload.scope);
  const requestedBy = validateMutationText(payload.requested_by, {
    required: false,
    multiline: false,
    maxLength: 200,
  });
  const requestedByLane = validateMutationText(payload.requested_by_lane, {
    required: false,
    multiline: false,
    maxLength: 60,
  });
  const requestedBySubjectType = validateMutationText(payload.requested_by_subject_type, {
    required: false,
    multiline: false,
    maxLength: 80,
  });

  return {
    user_request: userRequest,
    scope,
    constraints: normalizeStringList(payload.constraints),
    repo: scope.repo,
    requested_by: requestedBy || "chatgpt",
    requested_by_lane: requestedByLane || "public",
    requested_by_subject_type: requestedBySubjectType || "human_directed",
    model_identity: validateModelIdentity(payload.model_identity),
  };
}

function buildBaseWitnessPayload(actor, lane, subjectType, extraPayload) {
  const runtime = getRuntimeContext();
  return {
    actor_lane: lane,
    actor_subject_type: subjectType,
    actor_subject: actor,
    runtime_commit_sha: runtime.commit_sha,
    runtime_commit_source: runtime.commit_source,
    ...(extraPayload || {}),
  };
}

async function createOrchestrationJob(body) {
  const config = requireSupabaseConfig();
  if (!config) {
    const error = new Error("Supabase is not configured");
    error.code = "orchestration_not_configured";
    throw error;
  }

  const normalized = normalizeSubmitBody(body);
  const planArtifact = buildPlanArtifact(
    normalized.user_request,
    normalized.scope,
    normalized.constraints
  );

  const jobId = randomUUID();
  const createdAt = new Date().toISOString();
  const jobRow = {
    id: jobId,
    status: "queued",
    requested_by: normalized.requested_by,
    repo: normalized.repo || null,
    scope_json: isPlainObject(normalized.scope)
      ? {
          ...normalized.scope,
          requested_by_lane: normalized.requested_by_lane,
          requested_by_subject_type: normalized.requested_by_subject_type,
          model_identity: normalized.model_identity,
        }
      : {},
    user_request: normalized.user_request,
    constraints_json: normalized.constraints,
    initial_artifact_id: planArtifact.id,
    claimed_by: null,
    created_at: createdAt,
    updated_at: createdAt,
    last_heartbeat_at: null,
    completed_at: null,
    result_json: {},
  };

  const eventPayload = buildBaseWitnessPayload(
    normalized.requested_by,
    normalized.requested_by_lane,
    normalized.requested_by_subject_type,
    {
      job_id: jobId,
      repo: normalized.repo || null,
      artifact_id: planArtifact.id,
      policy_verdict: "queued",
      outcome_status: "queued",
      model_identity: normalized.model_identity,
    }
  );
  const eventRows = [
    {
      id: randomUUID(),
      job_id: jobId,
      ts: createdAt,
      type: "job_submitted",
      actor: normalized.requested_by,
      payload: eventPayload,
    },
  ];
  const witnessEvent = buildOrchestrationWitness(
    "orchestration.job_submitted",
    normalized.requested_by,
    planArtifact.id,
    {
      ...eventPayload,
      user_request: normalized.user_request,
    }
  );

  await insertRow(config, "plan_artifacts", {
    id: planArtifact.id,
    created_at: planArtifact.created_at,
    repo: normalized.repo || null,
    scope_json: planArtifact.scope,
    artifact_json: planArtifact,
    content_hash: planArtifact.content_hash,
    source_job_id: jobId,
  });
  await insertRow(config, "orchestration_jobs", jobRow);
  await insertRows(config, "orchestration_events", eventRows);
  await insertRow(config, "witness_events", witnessEvent);

  return {
    job_id: jobId,
    status: jobRow.status,
    artifact: planArtifact,
  };
}

async function getJobWithEvents(jobId) {
  const config = requireSupabaseConfig();
  if (!config) {
    const error = new Error("Supabase is not configured");
    error.code = "orchestration_not_configured";
    throw error;
  }

  const jobs = await selectRows(
    config,
    "orchestration_jobs",
    { id: `eq.${jobId}` },
    "*",
    undefined,
    1
  );
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return null;
  }

  const job = jobs[0];
  const events = await selectRows(
    config,
    "orchestration_events",
    { job_id: `eq.${jobId}` },
    "*",
    "ts.asc",
    20
  );
  const artifacts = await selectRows(
    config,
    "plan_artifacts",
    { source_job_id: `eq.${jobId}` },
    "id,created_at,content_hash,artifact_json",
    "created_at.asc",
    10
  );

  return { job, events: events || [], artifacts: artifacts || [] };
}

async function claimNextQueuedJob(workerId, metadata) {
  const config = requireSupabaseConfig();
  if (!config) {
    const error = new Error("Supabase is not configured");
    error.code = "orchestration_not_configured";
    throw error;
  }

  const queued = await selectRows(
    config,
    "orchestration_jobs",
    { status: "eq.queued" },
    "*",
    "created_at.asc",
    1
  );
  if (!Array.isArray(queued) || queued.length === 0) {
    return null;
  }

  const now = new Date().toISOString();
  const job = queued[0];
  const workerRuntime = sanitizeWorkerRuntime(metadata && metadata.worker_runtime);
  const updated = await patchRows(
    config,
    "orchestration_jobs",
    { id: `eq.${job.id}`, status: "eq.queued" },
    {
      status: "claimed",
      claimed_by: workerId,
      updated_at: now,
      last_heartbeat_at: now,
    },
    "*"
  );
  if (!Array.isArray(updated) || updated.length === 0) {
    return null;
  }

  const payload = buildBaseWitnessPayload(workerId, "worker", "worker", {
    job_id: job.id,
    repo: job.repo || null,
    policy_verdict: "claimed",
    outcome_status: "claimed",
    worker_runtime: workerRuntime,
  });
  await insertRow(config, "orchestration_events", {
    id: randomUUID(),
    job_id: job.id,
    ts: now,
    type: "job_claimed",
    actor: workerId,
    payload,
  });
  await insertRow(
    config,
    "witness_events",
    buildOrchestrationWitness("orchestration.job_claimed", workerId, job.initial_artifact_id, payload)
  );

  return updated[0];
}

async function updateJobLifecycle(jobId, workerId, nextStatus, payload) {
  const config = requireSupabaseConfig();
  if (!config) {
    const error = new Error("Supabase is not configured");
    error.code = "orchestration_not_configured";
    throw error;
  }

  if (!ACTIVE_JOB_STATUSES.has(nextStatus)) {
    const error = new Error("Unsupported job status");
    error.code = "invalid_job_status";
    throw error;
  }

  const currentRows = await selectRows(
    config,
    "orchestration_jobs",
    { id: `eq.${jobId}` },
    "*",
    undefined,
    1
  );
  const currentJob = Array.isArray(currentRows) ? currentRows[0] : null;
  if (!currentJob) {
    return null;
  }

  const now = new Date().toISOString();
  const workerRuntime = sanitizeWorkerRuntime(payload && payload.worker_runtime);
  const eventPayload = buildBaseWitnessPayload(workerId, "worker", "worker", {
    job_id: jobId,
    repo: currentJob.repo || null,
    policy_verdict: nextStatus,
    outcome_status: nextStatus,
    ...(payload && payload.event_payload ? payload.event_payload : {}),
    worker_runtime: workerRuntime,
    model_identity:
      payload && typeof payload.model_identity === "string" ? payload.model_identity : null,
  });

  const patch = {
    updated_at: now,
    last_heartbeat_at: now,
  };

  if (nextStatus !== "claimed") {
    patch.status = nextStatus;
  }

  if (nextStatus === "completed" || nextStatus === "failed" || nextStatus === "blocked") {
    patch.completed_at = now;
    patch.result_json = isPlainObject(payload && payload.result)
      ? {
          ...payload.result,
          worker_runtime: workerRuntime,
          actor: workerId,
          actor_lane: "worker",
          actor_subject_type: "worker",
          model_identity:
            payload && typeof payload.model_identity === "string" ? payload.model_identity : null,
          runtime_commit_sha: getRuntimeContext().commit_sha,
          runtime_commit_source: getRuntimeContext().commit_source,
          outcome_status: nextStatus,
        }
      : {
          worker_runtime: workerRuntime,
          actor: workerId,
          actor_lane: "worker",
          actor_subject_type: "worker",
          model_identity:
            payload && typeof payload.model_identity === "string" ? payload.model_identity : null,
          runtime_commit_sha: getRuntimeContext().commit_sha,
          runtime_commit_source: getRuntimeContext().commit_source,
          outcome_status: nextStatus,
        };
    if (payload && payload.policy_verdict && isPlainObject(payload.policy_verdict)) {
      patch.result_json.policy_verdict = payload.policy_verdict;
    }
  }

  const updated = await patchRows(
    config,
    "orchestration_jobs",
    { id: `eq.${jobId}` },
    patch,
    "*"
  );
  if (!Array.isArray(updated) || updated.length === 0) {
    return null;
  }

  await insertRow(config, "orchestration_events", {
    id: randomUUID(),
    job_id: jobId,
    ts: now,
    type: payload.event_type,
    actor: workerId,
    payload: eventPayload,
  });
  await insertRow(
    config,
    "witness_events",
    buildOrchestrationWitness(
      `orchestration.${payload.event_type}`,
      workerId,
      currentJob.initial_artifact_id,
      eventPayload
    )
  );

  return updated[0];
}

module.exports = {
  ACTIVE_JOB_STATUSES,
  claimNextQueuedJob,
  createOrchestrationJob,
  getJobWithEvents,
  normalizeSubmitBody,
  requireSupabaseConfig,
  updateJobLifecycle,
};
