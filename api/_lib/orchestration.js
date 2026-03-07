const { randomUUID } = require("crypto");
const { buildPlanArtifact, hashJson, isPlainObject, normalizeStringList } = require("./founderos-v1");
const {
  buildWitnessEvent,
  getSupabaseConfig,
  insertRow,
  insertRows,
  patchRows,
  selectRows,
} = require("./supabase");

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

function requireSupabaseConfig() {
  return getSupabaseConfig();
}

function normalizeSubmitBody(body) {
  const payload = isPlainObject(body) ? body : {};
  const userRequest =
    typeof payload.user_request === "string" ? payload.user_request.trim() : "";

  return {
    user_request: userRequest,
    scope: payload.scope,
    constraints: normalizeStringList(payload.constraints),
    repo: isPlainObject(payload.scope) && typeof payload.scope.repo === "string"
      ? payload.scope.repo.trim()
      : "",
    requested_by:
      typeof payload.requested_by === "string" && payload.requested_by.trim()
        ? payload.requested_by.trim()
        : "chatgpt",
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
    scope_json: isPlainObject(normalized.scope) ? normalized.scope : {},
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

  const eventRows = [
    {
      id: randomUUID(),
      job_id: jobId,
      ts: createdAt,
      type: "job_submitted",
      actor: normalized.requested_by,
      payload: {
        repo: normalized.repo || null,
        artifact_id: planArtifact.id,
      },
    },
  ];
  const witnessEvent = buildWitnessEvent(
    "orchestration.job_submitted",
    normalized.requested_by,
    {
      job_id: jobId,
      repo: normalized.repo || null,
      artifact_id: planArtifact.id,
      user_request: normalized.user_request,
    },
    planArtifact.id,
    null
  );
  witnessEvent.content_hash = hashJson({
    ts: witnessEvent.ts,
    type: witnessEvent.type,
    commit_id: witnessEvent.commit_id,
    artifact_id: witnessEvent.artifact_id,
    actor: witnessEvent.actor,
    payload: witnessEvent.payload,
  });

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

async function claimNextQueuedJob(workerId) {
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

  await insertRow(config, "orchestration_events", {
    id: randomUUID(),
    job_id: job.id,
    ts: now,
    type: "job_claimed",
    actor: workerId,
    payload: {},
  });

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

  const now = new Date().toISOString();
  const patch = {
    updated_at: now,
    last_heartbeat_at: now,
  };

  if (nextStatus !== "claimed") {
    patch.status = nextStatus;
  }

  if (nextStatus === "completed" || nextStatus === "failed" || nextStatus === "blocked") {
    patch.completed_at = now;
    patch.result_json = isPlainObject(payload && payload.result) ? payload.result : {};
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
    payload: payload.event_payload || {},
  });

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
