const { randomUUID } = require("crypto");
const {
  getAllowedRepos,
  hashJson,
  isPlainObject,
  isProtectedPath,
  parseRepoSlug,
  validateGitRefName,
  validateModelIdentity,
  validateMutationText,
  validatePullNumber,
  validateRelativeRepoPath,
} = require("./founderos-v1");
const { encodePathForGitHub, getInstallationToken, githubRequest } = require("./github");
const { buildWitnessEvent, getSupabaseConfig, insertRow, selectRows } = require("./supabase");
const { getRuntimeContext } = require("./runtime");

const ALLOWED_CHECK_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);

function buildContentHash(row) {
  return hashJson({
    ts: row.ts,
    type: row.type,
    commit_id: row.commit_id,
    artifact_id: row.artifact_id,
    actor: row.actor,
    payload: row.payload,
  });
}

function buildWitnessRow(type, artifactId, actor, payload, commitId) {
  const row = buildWitnessEvent(type, actor, payload, artifactId || null, commitId || null);
  row.content_hash = buildContentHash(row);
  return row;
}

function sanitizeWorkerRuntime(raw) {
  if (!isPlainObject(raw)) {
    return null;
  }

  const workerId =
    typeof raw.worker_id === "string" && raw.worker_id.trim() ? raw.worker_id.trim() : null;
  const commitSha =
    typeof raw.worker_commit_sha === "string" && /^[a-f0-9]{7,64}$/i.test(raw.worker_commit_sha.trim())
      ? raw.worker_commit_sha.trim()
      : null;
  const commitSource =
    typeof raw.worker_commit_source === "string" && raw.worker_commit_source.trim()
      ? raw.worker_commit_source.trim()
      : null;
  const version =
    typeof raw.worker_version === "string" && raw.worker_version.trim() ? raw.worker_version.trim() : null;

  if (!workerId && !commitSha && !commitSource && !version) {
    return null;
  }

  return {
    worker_id: workerId,
    worker_commit_sha: commitSha,
    worker_commit_source: commitSource,
    worker_version: version,
  };
}

function normalizeExecutionProvenance(provenance, actor, laneDefault) {
  const runtime = getRuntimeContext();
  const payload = isPlainObject(provenance) ? provenance : {};
  const actorLane =
    typeof payload.actor_lane === "string" && payload.actor_lane.trim()
      ? payload.actor_lane.trim()
      : laneDefault;
  const actorSubjectType =
    typeof payload.actor_subject_type === "string" && payload.actor_subject_type.trim()
      ? payload.actor_subject_type.trim()
      : laneDefault === "worker"
        ? "worker"
        : "human_directed";
  const actorSubject =
    typeof payload.actor_subject === "string" && payload.actor_subject.trim()
      ? payload.actor_subject.trim()
      : actor;
  const jobId =
    typeof payload.job_id === "string" && payload.job_id.trim() ? payload.job_id.trim() : null;

  return {
    actor_lane: actorLane,
    actor_subject_type: actorSubjectType,
    actor_subject: actorSubject,
    job_id: jobId,
    model_identity: validateModelIdentity(payload.model_identity),
    worker_runtime: sanitizeWorkerRuntime(payload.worker_runtime),
    runtime_commit_sha: runtime.commit_sha,
    runtime_commit_source: runtime.commit_source,
  };
}

function buildWriteSetWitnessPayload(writeSet, writeSetHash, planArtifactHash, provenance, extraPayload) {
  return {
    repo: writeSet.repo,
    base_branch: writeSet.base_branch,
    branch_name: writeSet.branch_name,
    title: writeSet.title,
    body_present: typeof writeSet.body === "string" && writeSet.body.length > 0,
    plan_artifact_hash: planArtifactHash || null,
    write_set_hash: writeSetHash,
    file_count: writeSet.files.length,
    files: writeSet.files.map((file) => ({
      path: file.path,
      action: file.action,
      content_sha256: hashJson({ content: file.content }),
    })),
    actor_lane: provenance.actor_lane,
    actor_subject_type: provenance.actor_subject_type,
    actor_subject: provenance.actor_subject,
    job_id: provenance.job_id,
    model_identity: provenance.model_identity,
    worker_runtime: provenance.worker_runtime,
    runtime_commit_sha: provenance.runtime_commit_sha,
    runtime_commit_source: provenance.runtime_commit_source,
    ...(extraPayload || {}),
  };
}

function buildMergeWitnessPayload(mergeInfo, provenance, extraPayload) {
  return {
    repo: mergeInfo.repo,
    pull_number: mergeInfo.pull_number,
    base_branch: mergeInfo.base_branch,
    head_branch: mergeInfo.head_branch,
    expected_head_sha: mergeInfo.expected_head_sha,
    head_sha: mergeInfo.head_sha,
    merge_method: "squash",
    actor_lane: provenance.actor_lane,
    actor_subject_type: provenance.actor_subject_type,
    actor_subject: provenance.actor_subject,
    job_id: provenance.job_id,
    model_identity: provenance.model_identity,
    worker_runtime: provenance.worker_runtime,
    runtime_commit_sha: provenance.runtime_commit_sha,
    runtime_commit_source: provenance.runtime_commit_source,
    ...(extraPayload || {}),
  };
}

function validateFileEntry(file, seenPaths) {
  if (!isPlainObject(file)) {
    return { ok: false, error: "invalid_file_entry" };
  }

  const path = validateRelativeRepoPath(file.path);
  if (!path) {
    return { ok: false, error: "invalid_file_entry" };
  }

  if (typeof file.content !== "string") {
    return { ok: false, error: "invalid_file_entry" };
  }

  if (typeof file.action !== "string" || (file.action !== "create" && file.action !== "update")) {
    return { ok: false, error: "invalid_file_action" };
  }

  if (seenPaths.has(path)) {
    return { ok: false, error: "duplicate_paths_rejected" };
  }
  seenPaths.add(path);

  if (isProtectedPath(path)) {
    return { ok: false, error: "protected_path", path, statusCode: 403 };
  }

  return {
    ok: true,
    file: {
      path,
      action: file.action,
      content: file.content,
    },
  };
}

function validateWriteSet(writeSet) {
  if (!isPlainObject(writeSet)) {
    return { ok: false, error: "write_set_required" };
  }

  const branchName = validateGitRefName(writeSet.branch_name);
  if (!branchName) {
    return { ok: false, error: "branch_name_required" };
  }

  const baseBranch = validateGitRefName(writeSet.base_branch);
  if (!baseBranch) {
    return { ok: false, error: "base_branch_required" };
  }

  const title = validateMutationText(writeSet.title, { required: true, multiline: false, maxLength: 300 });
  if (!title) {
    return { ok: false, error: "title_required" };
  }

  const repoInfo = parseRepoSlug(writeSet.repo);
  if (!repoInfo) {
    return { ok: false, error: "repo_required" };
  }

  if (!Array.isArray(writeSet.files) || writeSet.files.length === 0) {
    return { ok: false, error: "files_required" };
  }

  const files = [];
  const seenPaths = new Set();
  for (const file of writeSet.files) {
    const validated = validateFileEntry(file, seenPaths);
    if (!validated.ok) {
      return validated;
    }
    files.push(validated.file);
  }

  const body =
    writeSet.body === undefined
      ? null
      : validateMutationText(writeSet.body, {
          multiline: true,
          required: false,
          maxLength: 12000,
          trim: false,
        });
  if (writeSet.body !== undefined && body === "") {
    return { ok: false, error: "body_invalid" };
  }

  if (!getAllowedRepos().includes(repoInfo.full)) {
    return { ok: false, error: "repo_not_allowed", statusCode: 403 };
  }

  return {
    ok: true,
    owner: repoInfo.owner,
    repo: repoInfo.repo,
    writeSet: {
      repo: repoInfo.full,
      branch_name: branchName,
      base_branch: baseBranch,
      title,
      ...(body !== null ? { body } : {}),
      files,
    },
  };
}

function enforceDocsOnly(writeSet) {
  for (const file of writeSet.files) {
    if (!(file.path.startsWith("docs/") || file.path === "README.md")) {
      return { ok: false, error: "auto_execute_docs_only", path: file.path, statusCode: 403 };
    }
  }

  return { ok: true };
}

function buildFrozenWriteSetArtifact(writeSet, actor, planArtifactId, planArtifactHash) {
  const createdAt = new Date().toISOString();
  const artifactWithoutHash = {
    id: `frozen_write_set_${Date.now()}_${randomUUID().slice(0, 8)}`,
    type: "exact_write_set_frozen",
    created_at: createdAt,
    frozen_by: actor,
    plan_artifact_id: planArtifactId,
    plan_artifact_hash: planArtifactHash,
    write_set_hash: hashJson(writeSet),
    write_set: writeSet,
  };

  return {
    ...artifactWithoutHash,
    content_hash: hashJson(artifactWithoutHash),
  };
}

async function freezeWriteSet({ writeSet, actor, planArtifactId, planArtifactHash }) {
  const validation = validateWriteSet(writeSet);
  if (!validation.ok) {
    const error = new Error(validation.error);
    error.code = validation.error;
    error.statusCode = validation.statusCode || 400;
    error.path = validation.path;
    throw error;
  }

  const config = getSupabaseConfig();
  if (!config) {
    const error = new Error("artifact_store_not_configured");
    error.code = "artifact_store_not_configured";
    error.statusCode = 500;
    throw error;
  }

  const canonicalWriteSet = validation.writeSet;
  const artifact = buildFrozenWriteSetArtifact(
    canonicalWriteSet,
    actor,
    planArtifactId,
    planArtifactHash
  );
  await insertRow(config, "plan_artifacts", {
    id: artifact.id,
    created_at: artifact.created_at,
    repo: canonicalWriteSet.repo,
    scope_json: {
      repo: canonicalWriteSet.repo,
      branch: canonicalWriteSet.base_branch,
    },
    artifact_json: artifact,
    content_hash: artifact.content_hash,
    source_job_id: null,
  });

  const witnessEvent = buildWitnessRow(
    "commit.write_set_frozen",
    artifact.id,
    actor,
    {
      repo: canonicalWriteSet.repo,
      plan_artifact_id: planArtifactId,
      plan_artifact_hash: planArtifactHash,
      write_set_hash: artifact.write_set_hash,
      frozen_write_set_artifact_id: artifact.id,
      file_count: canonicalWriteSet.files.length,
      runtime_commit_sha: getRuntimeContext().commit_sha,
      runtime_commit_source: getRuntimeContext().commit_source,
    },
    null
  );
  await insertRow(config, "witness_events", witnessEvent);

  return artifact;
}

async function resolveFrozenWriteSetArtifact(frozenArtifactId, frozenArtifactHash) {
  const config = getSupabaseConfig();
  if (!config) {
    const error = new Error("artifact_store_not_configured");
    error.code = "artifact_store_not_configured";
    error.statusCode = 500;
    throw error;
  }

  const rows = await selectRows(
    config,
    "plan_artifacts",
    { id: `eq.${frozenArtifactId}` },
    "id,content_hash,artifact_json",
    undefined,
    1
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !isPlainObject(row.artifact_json)) {
    const error = new Error("frozen_write_set_not_found");
    error.code = "frozen_write_set_not_found";
    error.statusCode = 404;
    throw error;
  }

  if (typeof frozenArtifactHash === "string" && frozenArtifactHash.length > 0) {
    if (row.content_hash !== frozenArtifactHash) {
      const error = new Error("frozen_write_set_hash_mismatch");
      error.code = "frozen_write_set_hash_mismatch";
      error.statusCode = 400;
      throw error;
    }
  }

  const artifact = row.artifact_json;
  if (artifact.type !== "exact_write_set_frozen" || !isPlainObject(artifact.write_set)) {
    const error = new Error("frozen_write_set_invalid");
    error.code = "frozen_write_set_invalid";
    error.statusCode = 400;
    throw error;
  }

  return artifact;
}

function resolveAuthorizationProvenance(authorization, actor, laneDefault) {
  return normalizeExecutionProvenance(
    {
      actor_lane: authorization.actor_lane,
      actor_subject_type: authorization.actor_subject_type,
      actor_subject: authorization.actor_subject,
      job_id: authorization.job_id,
      model_identity: authorization.model_identity,
      worker_runtime: authorization.worker_runtime,
    },
    actor,
    laneDefault
  );
}

async function resolveWriteSetForExecution({ writeSet, authorization }) {
  if (!isPlainObject(authorization)) {
    return { ok: false, statusCode: 400, error: "authorization_required" };
  }

  if (
    typeof authorization.plan_artifact_id !== "string" ||
    authorization.plan_artifact_id.length === 0
  ) {
    return { ok: false, statusCode: 400, error: "plan_artifact_id_required" };
  }

  if (
    typeof authorization.plan_artifact_hash !== "string" ||
    authorization.plan_artifact_hash.length === 0
  ) {
    return { ok: false, statusCode: 400, error: "plan_artifact_hash_required" };
  }

  const authorizedBy = validateMutationText(authorization.authorized_by, {
    required: true,
    multiline: false,
    maxLength: 200,
  });
  if (!authorizedBy) {
    return { ok: false, statusCode: 400, error: "authorized_by_required" };
  }

  if (
    typeof authorization.frozen_write_set_artifact_id === "string" &&
    authorization.frozen_write_set_artifact_id.length > 0
  ) {
    const frozenArtifact = await resolveFrozenWriteSetArtifact(
      authorization.frozen_write_set_artifact_id,
      authorization.frozen_write_set_artifact_hash
    );

    if (frozenArtifact.plan_artifact_id !== authorization.plan_artifact_id) {
      return { ok: false, statusCode: 400, error: "plan_artifact_mismatch" };
    }

    if (frozenArtifact.plan_artifact_hash !== authorization.plan_artifact_hash) {
      return { ok: false, statusCode: 400, error: "plan_artifact_hash_mismatch" };
    }

    return {
      ok: true,
      writeSet: frozenArtifact.write_set,
      actor: authorizedBy,
      artifactId: frozenArtifact.id,
      planArtifactHash: authorization.plan_artifact_hash,
      provenance: resolveAuthorizationProvenance(authorization, authorizedBy, "public"),
    };
  }

  const validation = validateWriteSet(writeSet);
  if (!validation.ok) {
    return {
      ok: false,
      statusCode: validation.statusCode || 400,
      error: validation.error,
      path: validation.path,
    };
  }

  if (
    typeof authorization.write_set_hash !== "string" ||
    authorization.write_set_hash.length === 0
  ) {
    return { ok: false, statusCode: 400, error: "write_set_hash_required" };
  }

  const canonicalWriteSet = validation.writeSet;
  if (hashJson(canonicalWriteSet) !== authorization.write_set_hash) {
    return { ok: false, statusCode: 400, error: "write_set_hash_mismatch" };
  }

  return {
    ok: true,
    writeSet: canonicalWriteSet,
    actor: authorizedBy,
    artifactId: authorization.plan_artifact_id,
    planArtifactHash: authorization.plan_artifact_hash,
    provenance: resolveAuthorizationProvenance(authorization, authorizedBy, "public"),
  };
}

function getGitHubConfig() {
  const config = getSupabaseConfig();
  if (!config) {
    const error = new Error("witness_not_configured");
    error.code = "witness_not_configured";
    error.statusCode = 500;
    throw error;
  }

  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_INSTALLATION_ID;
  const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!appId || !installationId || !privateKey.trim()) {
    const error = new Error("github_not_configured");
    error.code = "github_not_configured";
    error.statusCode = 500;
    throw error;
  }

  return {
    witnessConfig: config,
    appId,
    installationId,
    privateKey,
  };
}

async function getInstallationTokenOrThrow(githubConfig) {
  try {
    return await getInstallationToken(
      githubConfig.appId,
      githubConfig.installationId,
      githubConfig.privateKey
    );
  } catch (err) {
    err.stage = "github_auth";
    throw err;
  }
}

async function recordWitness(config, row) {
  return insertRow(config, "witness_events", row);
}

async function executeWriteSet({
  writeSet,
  actor,
  artifactId,
  planArtifactHash,
  witnessType,
  docsOnly,
  provenance,
}) {
  const validation = validateWriteSet(writeSet);
  if (!validation.ok) {
    const error = new Error(validation.error);
    error.code = validation.error;
    error.statusCode = validation.statusCode || 400;
    error.path = validation.path;
    throw error;
  }

  const canonicalWriteSet = validation.writeSet;

  if (docsOnly) {
    const docsValidation = enforceDocsOnly(canonicalWriteSet);
    if (!docsValidation.ok) {
      const error = new Error(docsValidation.error);
      error.code = docsValidation.error;
      error.statusCode = docsValidation.statusCode || 403;
      error.path = docsValidation.path;
      throw error;
    }
  }

  const githubConfig = getGitHubConfig();
  const writeSetHash = hashJson(canonicalWriteSet);
  const executionProvenance = normalizeExecutionProvenance(provenance, actor, docsOnly ? "worker" : "public");
  const witnessRow = buildWitnessRow(
    witnessType,
    artifactId,
    actor,
    buildWriteSetWitnessPayload(
      canonicalWriteSet,
      writeSetHash,
      planArtifactHash,
      executionProvenance,
      {
        policy_verdict: "allowed",
        outcome_status: "authorized",
      }
    ),
    null
  );
  const witnessInserted = await recordWitness(githubConfig.witnessConfig, witnessRow);
  const witnessId = witnessInserted && witnessInserted.id ? witnessInserted.id : witnessRow.id;

  const installationToken = await getInstallationTokenOrThrow(githubConfig);

  let baseRef;
  try {
    baseRef = await githubRequest(
      installationToken,
      "GET",
      `/repos/${encodeURIComponent(validation.owner)}/${encodeURIComponent(validation.repo)}/git/ref/heads/${encodeURIComponent(
        canonicalWriteSet.base_branch
      )}`
    );
  } catch (err) {
    err.stage = "read_base_ref";
    throw err;
  }
  const baseSha = baseRef && baseRef.object && baseRef.object.sha;

  try {
    await githubRequest(
      installationToken,
      "POST",
      `/repos/${encodeURIComponent(validation.owner)}/${encodeURIComponent(validation.repo)}/git/refs`,
      {
        ref: `refs/heads/${canonicalWriteSet.branch_name}`,
        sha: baseSha,
      }
    );
  } catch (err) {
    err.stage = "create_branch";
    throw err;
  }

  for (const file of canonicalWriteSet.files) {
    const encodedPath = encodePathForGitHub(file.path);
    const message = `${witnessType} ${file.action} ${file.path}`;
    const encodedContent = Buffer.from(file.content, "utf8").toString("base64");

    if (file.action === "create") {
      try {
        await githubRequest(
          installationToken,
          "PUT",
          `/repos/${encodeURIComponent(validation.owner)}/${encodeURIComponent(validation.repo)}/contents/${encodedPath}`,
          {
            message,
            content: encodedContent,
            branch: canonicalWriteSet.branch_name,
          }
        );
      } catch (err) {
        err.stage = `create_file:${file.path}`;
        throw err;
      }
      continue;
    }

    let existing;
    try {
      existing = await githubRequest(
        installationToken,
        "GET",
        `/repos/${encodeURIComponent(validation.owner)}/${encodeURIComponent(validation.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(
          canonicalWriteSet.branch_name
        )}`
      );
    } catch (err) {
      err.stage = `read_existing_file:${file.path}`;
      throw err;
    }

    try {
      await githubRequest(
        installationToken,
        "PUT",
        `/repos/${encodeURIComponent(validation.owner)}/${encodeURIComponent(validation.repo)}/contents/${encodedPath}`,
        {
          message,
          content: encodedContent,
          branch: canonicalWriteSet.branch_name,
          sha: existing.sha,
        }
      );
    } catch (err) {
      err.stage = `update_file:${file.path}`;
      throw err;
    }
  }

  const prRequest = {
    title: canonicalWriteSet.title,
    head: canonicalWriteSet.branch_name,
    base: canonicalWriteSet.base_branch,
  };
  if (typeof canonicalWriteSet.body === "string") {
    prRequest.body = canonicalWriteSet.body;
  }

  let pullRequest;
  try {
    pullRequest = await githubRequest(
      installationToken,
      "POST",
      `/repos/${encodeURIComponent(validation.owner)}/${encodeURIComponent(validation.repo)}/pulls`,
      prRequest
    );
  } catch (err) {
    err.stage = "create_pull_request";
    throw err;
  }

  return {
    execution: {
      pr_url: pullRequest.html_url,
      pr_number: pullRequest.number,
      branch: canonicalWriteSet.branch_name,
      repo: canonicalWriteSet.repo,
      files_written: canonicalWriteSet.files.length,
      write_set_hash: writeSetHash,
    },
    witness: {
      id: witnessId,
      type: witnessRow.type,
    },
  };
}

function validateCommitSha(value) {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value.trim()) ? value.trim() : "";
}

function evaluateChecks(statusResponse, checkRunsResponse, requiredContexts) {
  const statuses = Array.isArray(statusResponse && statusResponse.statuses)
    ? statusResponse.statuses
    : [];
  const checkRuns = Array.isArray(checkRunsResponse && checkRunsResponse.check_runs)
    ? checkRunsResponse.check_runs
    : [];
  const checksPresent = statuses.length > 0 || checkRuns.length > 0;
  const statusChecksGreen = statuses.length === 0 || statusResponse.state === "success";
  const checkRunsGreen =
    checkRuns.length === 0 ||
    checkRuns.every(
      (run) => run && run.status === "completed" && ALLOWED_CHECK_CONCLUSIONS.has(run.conclusion)
    );
  const successfulContexts = new Set(
    statuses
      .filter((status) => status && status.state === "success" && typeof status.context === "string")
      .map((status) => status.context)
  );
  for (const run of checkRuns) {
    if (
      run &&
      run.status === "completed" &&
      ALLOWED_CHECK_CONCLUSIONS.has(run.conclusion) &&
      typeof run.name === "string"
    ) {
      successfulContexts.add(run.name);
    }
  }

  const requiredSatisfied = requiredContexts.every((context) => successfulContexts.has(context));

  return {
    checks_present: checksPresent,
    checks_green: checksPresent && statusChecksGreen && checkRunsGreen && requiredSatisfied,
    combined_status_state: statusResponse && statusResponse.state ? statusResponse.state : null,
    required_contexts: requiredContexts,
    observed_green_contexts: Array.from(successfulContexts).sort(),
    total_status_contexts: statuses.length,
    total_check_runs: checkRuns.length,
  };
}

function buildMergePolicyError(code, message, extra) {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = (extra && extra.statusCode) || 403;
  if (extra && extra.details) {
    error.details = extra.details;
  }
  return error;
}

async function resolvePullRequestMergeRequest({ repo, pullNumber, authorization }) {
  if (!isPlainObject(authorization)) {
    return { ok: false, statusCode: 400, error: "authorization_required" };
  }

  const action = validateMutationText(authorization.action, {
    required: true,
    multiline: false,
    maxLength: 80,
  });
  if (action !== "merge_pull_request") {
    return { ok: false, statusCode: 400, error: "merge_action_invalid" };
  }

  const repoInfo = parseRepoSlug(repo);
  if (!repoInfo) {
    return { ok: false, statusCode: 400, error: "repo_required" };
  }

  if (!getAllowedRepos().includes(repoInfo.full)) {
    return { ok: false, statusCode: 403, error: "repo_not_allowed" };
  }

  const normalizedPullNumber = validatePullNumber(pullNumber);
  if (!normalizedPullNumber) {
    return { ok: false, statusCode: 400, error: "pull_number_required" };
  }

  const authorizedBy = validateMutationText(authorization.authorized_by, {
    required: true,
    multiline: false,
    maxLength: 200,
  });
  if (!authorizedBy) {
    return { ok: false, statusCode: 400, error: "authorized_by_required" };
  }

  const expectedHeadSha = validateCommitSha(authorization.expected_head_sha);
  if (!expectedHeadSha) {
    return { ok: false, statusCode: 400, error: "expected_head_sha_required" };
  }

  const expectedBaseBranch = validateGitRefName(authorization.expected_base_branch);
  if (!expectedBaseBranch) {
    return { ok: false, statusCode: 400, error: "expected_base_branch_required" };
  }

  if (
    authorization.merge_method !== undefined &&
    validateMutationText(authorization.merge_method, {
      required: true,
      multiline: false,
      maxLength: 20,
    }) !== "squash"
  ) {
    return { ok: false, statusCode: 400, error: "merge_method_not_allowed" };
  }

  return {
    ok: true,
    actor: authorizedBy,
    repoInfo,
    pull_number: normalizedPullNumber,
    expected_head_sha: expectedHeadSha,
    expected_base_branch: expectedBaseBranch,
    provenance: resolveAuthorizationProvenance(authorization, authorizedBy, "public"),
  };
}

async function mergePullRequest({ repo, pullNumber, authorization }) {
  const resolved = await resolvePullRequestMergeRequest({ repo, pullNumber, authorization });
  if (!resolved.ok) {
    const error = new Error(resolved.error);
    error.code = resolved.error;
    error.statusCode = resolved.statusCode || 400;
    throw error;
  }

  const githubConfig = getGitHubConfig();
  const installationToken = await getInstallationTokenOrThrow(githubConfig);

  let pullRequest;
  try {
    pullRequest = await githubRequest(
      installationToken,
      "GET",
      `/repos/${encodeURIComponent(resolved.repoInfo.owner)}/${encodeURIComponent(
        resolved.repoInfo.repo
      )}/pulls/${resolved.pull_number}`
    );
  } catch (err) {
    err.stage = "read_pull_request";
    throw err;
  }

  const mergeInfo = {
    repo: resolved.repoInfo.full,
    pull_number: resolved.pull_number,
    base_branch: pullRequest && pullRequest.base ? pullRequest.base.ref : null,
    head_branch: pullRequest && pullRequest.head ? pullRequest.head.ref : null,
    expected_head_sha: resolved.expected_head_sha,
    head_sha: pullRequest && pullRequest.head ? pullRequest.head.sha : null,
    pr_url: pullRequest ? pullRequest.html_url : null,
  };

  const policyDetails = {
    pr_state: pullRequest ? pullRequest.state : null,
    pr_draft: Boolean(pullRequest && pullRequest.draft),
    merged: Boolean(pullRequest && pullRequest.merged),
    mergeable: pullRequest ? pullRequest.mergeable : null,
    mergeable_state: pullRequest ? pullRequest.mergeable_state : null,
  };

  if (!pullRequest || pullRequest.state !== "open" || pullRequest.merged) {
    const rejection = buildWitnessRow(
      "commit.pr_merge_rejected",
      `pr_${resolved.pull_number}`,
      resolved.actor,
      buildMergeWitnessPayload(mergeInfo, resolved.provenance, {
        policy_verdict: "rejected",
        rejection_reason: "pull_request_not_open",
        outcome_status: "rejected",
        policy_details: policyDetails,
      }),
      null
    );
    await recordWitness(githubConfig.witnessConfig, rejection);
    throw buildMergePolicyError("pull_request_not_open", "Pull request must be open");
  }

  if (pullRequest.draft) {
    const rejection = buildWitnessRow(
      "commit.pr_merge_rejected",
      `pr_${resolved.pull_number}`,
      resolved.actor,
      buildMergeWitnessPayload(mergeInfo, resolved.provenance, {
        policy_verdict: "rejected",
        rejection_reason: "pull_request_is_draft",
        outcome_status: "rejected",
        policy_details: policyDetails,
      }),
      null
    );
    await recordWitness(githubConfig.witnessConfig, rejection);
    throw buildMergePolicyError("pull_request_is_draft", "Draft pull requests cannot be merged");
  }

  if (pullRequest.base.ref !== resolved.expected_base_branch) {
    const rejection = buildWitnessRow(
      "commit.pr_merge_rejected",
      `pr_${resolved.pull_number}`,
      resolved.actor,
      buildMergeWitnessPayload(mergeInfo, resolved.provenance, {
        policy_verdict: "rejected",
        rejection_reason: "base_branch_mismatch",
        outcome_status: "rejected",
        policy_details: policyDetails,
      }),
      null
    );
    await recordWitness(githubConfig.witnessConfig, rejection);
    throw buildMergePolicyError("base_branch_mismatch", "Base branch does not match authorization");
  }

  if (pullRequest.head.sha !== resolved.expected_head_sha) {
    const rejection = buildWitnessRow(
      "commit.pr_merge_rejected",
      `pr_${resolved.pull_number}`,
      resolved.actor,
      buildMergeWitnessPayload(mergeInfo, resolved.provenance, {
        policy_verdict: "rejected",
        rejection_reason: "head_sha_mismatch",
        outcome_status: "rejected",
        policy_details: policyDetails,
      }),
      null
    );
    await recordWitness(githubConfig.witnessConfig, rejection);
    throw buildMergePolicyError("head_sha_mismatch", "PR head SHA does not match authorization");
  }

  if (pullRequest.mergeable !== true) {
    const rejection = buildWitnessRow(
      "commit.pr_merge_rejected",
      `pr_${resolved.pull_number}`,
      resolved.actor,
      buildMergeWitnessPayload(mergeInfo, resolved.provenance, {
        policy_verdict: "rejected",
        rejection_reason: "pull_request_not_mergeable",
        outcome_status: "rejected",
        policy_details: policyDetails,
      }),
      null
    );
    await recordWitness(githubConfig.witnessConfig, rejection);
    throw buildMergePolicyError(
      "pull_request_not_mergeable",
      "GitHub does not report this PR as mergeable yet"
    );
  }

  let branchInfo;
  try {
    branchInfo = await githubRequest(
      installationToken,
      "GET",
      `/repos/${encodeURIComponent(resolved.repoInfo.owner)}/${encodeURIComponent(
        resolved.repoInfo.repo
      )}/branches/${encodeURIComponent(resolved.expected_base_branch)}`
    );
  } catch (err) {
    err.stage = "read_base_branch";
    throw err;
  }

  if (!branchInfo || branchInfo.protected !== true) {
    const rejection = buildWitnessRow(
      "commit.pr_merge_rejected",
      `pr_${resolved.pull_number}`,
      resolved.actor,
      buildMergeWitnessPayload(mergeInfo, resolved.provenance, {
        policy_verdict: "rejected",
        rejection_reason: "base_branch_not_protected",
        outcome_status: "rejected",
        policy_details: {
          ...policyDetails,
          base_branch_protected: Boolean(branchInfo && branchInfo.protected),
        },
      }),
      null
    );
    await recordWitness(githubConfig.witnessConfig, rejection);
    throw buildMergePolicyError(
      "base_branch_not_protected",
      "This merge path only permits merges into protected branches"
    );
  }

  let combinedStatus;
  let checkRuns;
  try {
    combinedStatus = await githubRequest(
      installationToken,
      "GET",
      `/repos/${encodeURIComponent(resolved.repoInfo.owner)}/${encodeURIComponent(
        resolved.repoInfo.repo
      )}/commits/${encodeURIComponent(resolved.expected_head_sha)}/status`
    );
    checkRuns = await githubRequest(
      installationToken,
      "GET",
      `/repos/${encodeURIComponent(resolved.repoInfo.owner)}/${encodeURIComponent(
        resolved.repoInfo.repo
      )}/commits/${encodeURIComponent(resolved.expected_head_sha)}/check-runs?per_page=100`
    );
  } catch (err) {
    err.stage = "read_checks";
    throw err;
  }

  const requiredContexts =
    branchInfo &&
    branchInfo.protection &&
    branchInfo.protection.required_status_checks &&
    Array.isArray(branchInfo.protection.required_status_checks.contexts)
      ? branchInfo.protection.required_status_checks.contexts
      : [];
  const checkPolicy = evaluateChecks(combinedStatus, checkRuns, requiredContexts);
  if (!checkPolicy.checks_green) {
    const rejection = buildWitnessRow(
      "commit.pr_merge_rejected",
      `pr_${resolved.pull_number}`,
      resolved.actor,
      buildMergeWitnessPayload(mergeInfo, resolved.provenance, {
        policy_verdict: "rejected",
        rejection_reason: "checks_not_green",
        outcome_status: "rejected",
        policy_details: {
          ...policyDetails,
          base_branch_protected: true,
          checks: checkPolicy,
        },
      }),
      null
    );
    await recordWitness(githubConfig.witnessConfig, rejection);
    throw buildMergePolicyError("checks_not_green", "GitHub checks are not green");
  }

  const authorizationWitness = buildWitnessRow(
    "commit.pr_merge_authorized",
    `pr_${resolved.pull_number}`,
    resolved.actor,
    buildMergeWitnessPayload(mergeInfo, resolved.provenance, {
      policy_verdict: "allowed",
      outcome_status: "authorized",
      policy_details: {
        ...policyDetails,
        base_branch_protected: true,
        checks: checkPolicy,
      },
    }),
    null
  );
  const authorizationInserted = await recordWitness(
    githubConfig.witnessConfig,
    authorizationWitness
  );

  let mergeResponse;
  try {
    mergeResponse = await githubRequest(
      installationToken,
      "PUT",
      `/repos/${encodeURIComponent(resolved.repoInfo.owner)}/${encodeURIComponent(
        resolved.repoInfo.repo
      )}/pulls/${resolved.pull_number}/merge`,
      {
        sha: resolved.expected_head_sha,
        merge_method: "squash",
      }
    );
  } catch (err) {
    const failureWitness = buildWitnessRow(
      "commit.pr_merge_failed",
      `pr_${resolved.pull_number}`,
      resolved.actor,
      buildMergeWitnessPayload(mergeInfo, resolved.provenance, {
        policy_verdict: "allowed",
        outcome_status: "github_merge_failed",
        failure_stage: "merge_pull_request",
        failure_detail: err && err.message ? err.message : "GitHub merge failed",
      }),
      null
    );
    await recordWitness(githubConfig.witnessConfig, failureWitness);
    err.stage = "merge_pull_request";
    throw err;
  }

  const mergedWitness = buildWitnessRow(
    "commit.pr_merged",
    `pr_${resolved.pull_number}`,
    resolved.actor,
    buildMergeWitnessPayload(mergeInfo, resolved.provenance, {
      policy_verdict: "allowed",
      outcome_status: "merged",
      merged: Boolean(mergeResponse && mergeResponse.merged),
      merge_message: mergeResponse && mergeResponse.message ? mergeResponse.message : null,
    }),
    mergeResponse && mergeResponse.sha ? mergeResponse.sha : null
  );
  const mergedInserted = await recordWitness(githubConfig.witnessConfig, mergedWitness);

  return {
    execution: {
      repo: resolved.repoInfo.full,
      pr_number: resolved.pull_number,
      pr_url: mergeInfo.pr_url,
      merge_method: "squash",
      merged: Boolean(mergeResponse && mergeResponse.merged),
      merge_commit_sha: mergeResponse && mergeResponse.sha ? mergeResponse.sha : null,
      head_sha: resolved.expected_head_sha,
      base_branch: resolved.expected_base_branch,
    },
    witness: {
      id:
        authorizationInserted && authorizationInserted.id
          ? authorizationInserted.id
          : authorizationWitness.id,
      type: authorizationWitness.type,
      completion_id: mergedInserted && mergedInserted.id ? mergedInserted.id : mergedWitness.id,
    },
  };
}

module.exports = {
  executeWriteSet,
  freezeWriteSet,
  mergePullRequest,
  resolvePullRequestMergeRequest,
  resolveWriteSetForExecution,
  validateWriteSet,
};
