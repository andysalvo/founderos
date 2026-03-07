const { randomUUID } = require("crypto");
const { getAllowedRepos, hashJson, isPlainObject, isProtectedPath } = require("./founderos-v1");
const { encodePathForGitHub, getInstallationToken, githubRequest } = require("./github");
const { getSupabaseConfig, insertRow } = require("./supabase");

function validateWriteSet(writeSet) {
  if (!isPlainObject(writeSet)) {
    return { ok: false, error: "write_set_required" };
  }

  if (typeof writeSet.branch_name !== "string" || writeSet.branch_name.length === 0) {
    return { ok: false, error: "branch_name_required" };
  }

  if (typeof writeSet.base_branch !== "string" || writeSet.base_branch.length === 0) {
    return { ok: false, error: "base_branch_required" };
  }

  if (typeof writeSet.title !== "string" || writeSet.title.length === 0) {
    return { ok: false, error: "title_required" };
  }

  if (typeof writeSet.repo !== "string" || writeSet.repo.length === 0) {
    return { ok: false, error: "repo_required" };
  }

  if (!Array.isArray(writeSet.files) || writeSet.files.length === 0) {
    return { ok: false, error: "files_required" };
  }

  const seenPaths = new Set();
  for (const file of writeSet.files) {
    if (!isPlainObject(file)) {
      return { ok: false, error: "invalid_file_entry" };
    }

    if (
      typeof file.path !== "string" ||
      file.path.length === 0 ||
      typeof file.content !== "string" ||
      typeof file.action !== "string" ||
      file.action.length === 0
    ) {
      return { ok: false, error: "invalid_file_entry" };
    }

    if (file.action !== "create" && file.action !== "update") {
      return { ok: false, error: "invalid_file_action" };
    }

    if (file.path.includes("..")) {
      return { ok: false, error: "path_traversal_rejected" };
    }

    if (file.path.startsWith("/")) {
      return { ok: false, error: "absolute_path_rejected" };
    }

    if (seenPaths.has(file.path)) {
      return { ok: false, error: "duplicate_paths_rejected" };
    }

    seenPaths.add(file.path);

    if (isProtectedPath(file.path)) {
      return { ok: false, error: "protected_path", path: file.path, statusCode: 403 };
    }
  }

  const allowedRepos = getAllowedRepos();
  if (!allowedRepos.includes(writeSet.repo)) {
    return { ok: false, error: "repo_not_allowed", statusCode: 403 };
  }

  const repoParts = writeSet.repo.split("/");
  if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
    return { ok: false, error: "repo_required" };
  }

  return { ok: true, owner: repoParts[0], repo: repoParts[1] };
}

function enforceDocsOnly(writeSet) {
  for (const file of writeSet.files) {
    if (!(file.path.startsWith("docs/") || file.path === "README.md")) {
      return { ok: false, error: "auto_execute_docs_only", path: file.path, statusCode: 403 };
    }
  }

  return { ok: true };
}

function buildWitnessRow(type, artifactId, actor, writeSet, writeSetHash, planArtifactHash) {
  const row = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    type,
    commit_id: null,
    artifact_id: artifactId || null,
    actor,
    payload: {
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
    },
  };

  row.content_hash = hashJson({
    ts: row.ts,
    type: row.type,
    commit_id: row.commit_id,
    artifact_id: row.artifact_id,
    actor: row.actor,
    payload: row.payload,
  });

  return row;
}

async function executeWriteSet({
  writeSet,
  actor,
  artifactId,
  planArtifactHash,
  witnessType,
  docsOnly,
}) {
  const validation = validateWriteSet(writeSet);
  if (!validation.ok) {
    const error = new Error(validation.error);
    error.code = validation.error;
    error.statusCode = validation.statusCode || 400;
    error.path = validation.path;
    throw error;
  }

  if (docsOnly) {
    const docsValidation = enforceDocsOnly(writeSet);
    if (!docsValidation.ok) {
      const error = new Error(docsValidation.error);
      error.code = docsValidation.error;
      error.statusCode = docsValidation.statusCode || 403;
      error.path = docsValidation.path;
      throw error;
    }
  }

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

  const writeSetHash = hashJson(writeSet);
  const witnessRow = buildWitnessRow(
    witnessType,
    artifactId,
    actor,
    writeSet,
    writeSetHash,
    planArtifactHash
  );
  const witnessInserted = await insertRow(config, "witness_events", witnessRow);
  const witnessId = witnessInserted && witnessInserted.id ? witnessInserted.id : witnessRow.id;

  let installationToken;
  try {
    installationToken = await getInstallationToken(appId, installationId, privateKey);
  } catch (err) {
    err.stage = "github_auth";
    throw err;
  }

  let baseRef;
  try {
    baseRef = await githubRequest(
      installationToken,
      "GET",
      `/repos/${encodeURIComponent(validation.owner)}/${encodeURIComponent(validation.repo)}/git/ref/heads/${encodeURIComponent(
        writeSet.base_branch
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
        ref: `refs/heads/${writeSet.branch_name}`,
        sha: baseSha,
      }
    );
  } catch (err) {
    err.stage = "create_branch";
    throw err;
  }

  for (const file of writeSet.files) {
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
            branch: writeSet.branch_name,
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
          writeSet.branch_name
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
          branch: writeSet.branch_name,
          sha: existing.sha,
        }
      );
    } catch (err) {
      err.stage = `update_file:${file.path}`;
      throw err;
    }
  }

  const prRequest = {
    title: writeSet.title,
    head: writeSet.branch_name,
    base: writeSet.base_branch,
  };
  if (typeof writeSet.body === "string") {
    prRequest.body = writeSet.body;
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
      branch: writeSet.branch_name,
      repo: writeSet.repo,
      files_written: writeSet.files.length,
      write_set_hash: writeSetHash,
    },
    witness: {
      id: witnessId,
      type: witnessRow.type,
    },
  };
}

module.exports = {
  executeWriteSet,
  validateWriteSet,
};
