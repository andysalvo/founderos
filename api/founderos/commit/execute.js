const { randomUUID, createHash, createSign } = require("crypto");

function sendJson(res, statusCode, payload, extraHeaders) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  if (extraHeaders && typeof extraHeaders === "object") {
    for (const [key, value] of Object.entries(extraHeaders)) {
      res.setHeader(key, value);
    }
  }
  return res.end(JSON.stringify(payload));
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBody(body) {
  if (typeof body === "string") {
    try {
      return { ok: true, value: JSON.parse(body) };
    } catch (_err) {
      return { ok: false };
    }
  }
  if (Buffer.isBuffer(body)) {
    try {
      return { ok: true, value: JSON.parse(body.toString("utf8")) };
    } catch (_err) {
      return { ok: false };
    }
  }
  if (body === undefined || body === null) {
    return { ok: true, value: {} };
  }
  if (isPlainObject(body)) {
    return { ok: true, value: body };
  }
  return { ok: false };
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlEncodeBuffer(buffer) {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createGitHubAppJwt(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: String(appId),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);

  return `${signingInput}.${base64UrlEncodeBuffer(signature)}`;
}

function encodePathForGitHub(path) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function githubRequest(token, method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = `GitHub API ${response.status}`;
    try {
      const data = await response.json();
      if (data && typeof data.message === "string" && data.message) {
        detail = data.message;
      }
    } catch (_err) {
      // Preserve default detail when response body is not JSON.
    }
    const error = new Error(detail);
    error.code = "github_api_error";
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function getInstallationToken(appId, installationId, privateKeyPem) {
  const jwt = createGitHubAppJwt(appId, privateKeyPem);

  const response = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!response.ok) {
    let detail = `GitHub auth ${response.status}`;
    try {
      const data = await response.json();
      if (data && typeof data.message === "string" && data.message) {
        detail = data.message;
      }
    } catch (_err) {
      // Preserve default detail when response body is not JSON.
    }
    const error = new Error(detail);
    error.code = "github_api_error";
    throw error;
  }

  const data = await response.json();
  return data.token;
}

function isProtectedPath(path) {
  if (path.startsWith("api/founderos/commit/")) return true;
  if (path === "api/founderos/commit") return true;
  if (path.startsWith("api/founderos/witness/")) return true;
  if (path === "api/founderos/witness") return true;
  if (path.startsWith(".env")) return true;
  if (path === "vercel.json") return true;
  if (path.startsWith(".github/workflows/")) return true;
  if (path === ".github/workflows") return true;
  return false;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return sendJson(
        res,
        405,
        { ok: false, error: "method_not_allowed" },
        { Allow: "POST" }
      );
    }

    const key = req.headers && req.headers["x-founderos-key"];
    if (!key || key !== process.env.FOUNDEROS_WRITE_KEY) {
      return sendJson(res, 401, { ok: false, error: "unauthorized" });
    }

    const parsed = parseBody(req.body);
    if (!parsed.ok || !isPlainObject(parsed.value)) {
      return sendJson(res, 400, { ok: false, error: "invalid_json" });
    }

    const body = parsed.value;
    const writeSet = body.write_set;
    const authorization = body.authorization;

    // Hard validation: reject missing or invalid top-level objects.
    if (!isPlainObject(writeSet)) {
      return sendJson(res, 400, { ok: false, error: "write_set_required" });
    }
    if (!isPlainObject(authorization)) {
      return sendJson(res, 400, { ok: false, error: "authorization_required" });
    }

    // Hard validation: required write set fields.
    if (typeof writeSet.branch_name !== "string" || writeSet.branch_name.length === 0) {
      return sendJson(res, 400, { ok: false, error: "branch_name_required" });
    }
    if (typeof writeSet.base_branch !== "string" || writeSet.base_branch.length === 0) {
      return sendJson(res, 400, { ok: false, error: "base_branch_required" });
    }
    if (typeof writeSet.title !== "string" || writeSet.title.length === 0) {
      return sendJson(res, 400, { ok: false, error: "title_required" });
    }
    if (typeof writeSet.repo !== "string" || writeSet.repo.length === 0) {
      return sendJson(res, 400, { ok: false, error: "repo_required" });
    }
    if (!Array.isArray(writeSet.files) || writeSet.files.length === 0) {
      return sendJson(res, 400, { ok: false, error: "files_required" });
    }

    // Hard validation: required authorization fields.
    if (
      typeof authorization.plan_artifact_id !== "string" ||
      authorization.plan_artifact_id.length === 0
    ) {
      return sendJson(res, 400, { ok: false, error: "plan_artifact_id_required" });
    }
    if (
      typeof authorization.plan_artifact_hash !== "string" ||
      authorization.plan_artifact_hash.length === 0
    ) {
      return sendJson(res, 400, { ok: false, error: "plan_artifact_hash_required" });
    }
    if (
      typeof authorization.write_set_hash !== "string" ||
      authorization.write_set_hash.length === 0
    ) {
      return sendJson(res, 400, { ok: false, error: "write_set_hash_required" });
    }
    if (
      typeof authorization.authorized_by !== "string" ||
      authorization.authorized_by.length === 0
    ) {
      return sendJson(res, 400, { ok: false, error: "authorized_by_required" });
    }

    // Hash bind check: execute only the exact authorized bytes.
    const computedWriteSetHash = createHash("sha256")
      .update(JSON.stringify(writeSet))
      .digest("hex");
    if (computedWriteSetHash !== authorization.write_set_hash) {
      return sendJson(res, 400, { ok: false, error: "write_set_hash_mismatch" });
    }

    // Structural hazard checks + strict file entry validation.
    const seenPaths = new Set();
    for (const file of writeSet.files) {
      if (!isPlainObject(file)) {
        return sendJson(res, 400, { ok: false, error: "invalid_file_entry" });
      }
      if (
        typeof file.path !== "string" ||
        file.path.length === 0 ||
        typeof file.content !== "string" ||
        typeof file.action !== "string" ||
        file.action.length === 0
      ) {
        return sendJson(res, 400, { ok: false, error: "invalid_file_entry" });
      }
      if (file.action !== "create" && file.action !== "update") {
        return sendJson(res, 400, { ok: false, error: "invalid_file_action" });
      }
      if (file.path.includes("..")) {
        return sendJson(res, 400, { ok: false, error: "path_traversal_rejected" });
      }
      if (file.path.startsWith("/")) {
        return sendJson(res, 400, { ok: false, error: "absolute_path_rejected" });
      }
      if (seenPaths.has(file.path)) {
        return sendJson(res, 400, { ok: false, error: "duplicate_paths_rejected" });
      }
      seenPaths.add(file.path);

      if (isProtectedPath(file.path)) {
        return sendJson(res, 403, {
          ok: false,
          error: "protected_path",
          path: file.path,
        });
      }
    }

    // Repo allowlist check.
    const allowedRepos = (process.env.ALLOWED_REPOS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (!allowedRepos.includes(writeSet.repo)) {
      return sendJson(res, 403, { ok: false, error: "repo_not_allowed" });
    }

    const repoParts = writeSet.repo.split("/");
    if (repoParts.length !== 2 || !repoParts[0] || !repoParts[1]) {
      return sendJson(res, 400, { ok: false, error: "repo_required" });
    }
    const owner = repoParts[0];
    const repo = repoParts[1];

    const appId = process.env.GITHUB_APP_ID;
    const installationId = process.env.GITHUB_INSTALLATION_ID;
    const rawPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

    let installationToken;
    try {
      installationToken = await getInstallationToken(appId, installationId, privateKey);
    } catch (err) {
      return sendJson(res, 502, {
        ok: false,
        error: "github_api_error",
        detail: err && err.message ? err.message : "GitHub authentication failed",
      });
    }

    // 1) Resolve base branch SHA.
    let baseRef;
    try {
      baseRef = await githubRequest(
        installationToken,
        "GET",
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(
          writeSet.base_branch
        )}`
      );
    } catch (err) {
      return sendJson(res, 502, {
        ok: false,
        error: "github_api_error",
        detail: err && err.message ? err.message : "Failed to read base branch",
      });
    }

    const baseSha = baseRef && baseRef.object && baseRef.object.sha;

    // 2) Create target branch at base SHA.
    try {
      await githubRequest(
        installationToken,
        "POST",
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
        {
          ref: `refs/heads/${writeSet.branch_name}`,
          sha: baseSha,
        }
      );
    } catch (err) {
      return sendJson(res, 502, {
        ok: false,
        error: "github_api_error",
        detail: err && err.message ? err.message : "Failed to create branch",
      });
    }

    // 3) Apply each file in exact provided order with exact provided bytes.
    for (const file of writeSet.files) {
      const encodedPath = encodePathForGitHub(file.path);
      const message = `founderos commit.execute ${file.action} ${file.path}`;
      const encodedContent = Buffer.from(file.content, "utf8").toString("base64");

      if (file.action === "create") {
        try {
          await githubRequest(
            installationToken,
            "PUT",
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
            {
              message,
              content: encodedContent,
              branch: writeSet.branch_name,
            }
          );
        } catch (err) {
          return sendJson(res, 502, {
            ok: false,
            error: "github_api_error",
            detail: err && err.message ? err.message : "Failed to create file",
          });
        }
      }

      if (file.action === "update") {
        let existing;
        try {
          existing = await githubRequest(
            installationToken,
            "GET",
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(
              writeSet.branch_name
            )}`
          );
        } catch (err) {
          return sendJson(res, 502, {
            ok: false,
            error: "github_api_error",
            detail: err && err.message ? err.message : "Failed to read existing file for update",
          });
        }

        try {
          await githubRequest(
            installationToken,
            "PUT",
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
            {
              message,
              content: encodedContent,
              branch: writeSet.branch_name,
              sha: existing.sha,
            }
          );
        } catch (err) {
          return sendJson(res, 502, {
            ok: false,
            error: "github_api_error",
            detail: err && err.message ? err.message : "Failed to update file",
          });
        }
      }
    }

    // 4) Open PR from exact branch to exact base.
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
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
        prRequest
      );
    } catch (err) {
      return sendJson(res, 502, {
        ok: false,
        error: "github_api_error",
        detail: err && err.message ? err.message : "Failed to create pull request",
      });
    }

    // Append-only witness record for commit execution.
    let witnessId = null;
    let witnessError = null;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const witnessPayload = {
      repo: writeSet.repo,
      branch_name: writeSet.branch_name,
      pr_number: pullRequest.number,
      pr_url: pullRequest.html_url,
      write_set_hash: authorization.write_set_hash,
      file_count: writeSet.files.length,
    };

    const witnessRow = {
      id: randomUUID(),
      ts: new Date().toISOString(),
      type: "commit.executed",
      commit_id: null,
      artifact_id: authorization.plan_artifact_id,
      actor: authorization.authorized_by,
      payload: witnessPayload,
      content_hash: createHash("sha256")
        .update(JSON.stringify(witnessPayload))
        .digest("hex"),
    };

    if (!supabaseUrl || !supabaseKey) {
      witnessError = "supabase_not_configured";
    } else {
      try {
        const witnessResponse = await fetch(
          `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/witness_events`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              apikey: supabaseKey,
              authorization: `Bearer ${supabaseKey}`,
              prefer: "return=representation",
            },
            body: JSON.stringify(witnessRow),
          }
        );

        if (!witnessResponse.ok) {
          witnessError = "supabase_insert_failed";
        } else {
          witnessId = witnessRow.id;
          try {
            const inserted = await witnessResponse.json();
            if (Array.isArray(inserted) && inserted[0] && inserted[0].id) {
              witnessId = inserted[0].id;
            }
          } catch (_err) {
            // Keep generated witness id if response body parsing fails.
          }
        }
      } catch (_err) {
        witnessError = "supabase_insert_failed";
      }
    }

    const responsePayload = {
      ok: true,
      execution: {
        pr_url: pullRequest.html_url,
        pr_number: pullRequest.number,
        branch: writeSet.branch_name,
        repo: writeSet.repo,
        files_written: writeSet.files.length,
        write_set_hash: authorization.write_set_hash,
        witness_id: witnessId,
      },
    };

    if (witnessError) {
      responsePayload.witness_error = witnessError;
    }

    return sendJson(res, 200, responsePayload);
  } catch (_err) {
    return sendJson(res, 500, { ok: false, error: "internal_error" });
  }
};
