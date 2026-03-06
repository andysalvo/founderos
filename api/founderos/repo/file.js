const {
  getAllowedRepos,
  isPlainObject,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
} = require("../../_lib/founderos-v1");
const {
  encodePathForGitHub,
  getInstallationToken,
  githubRequest,
} = require("../../_lib/github");

function parseRepo(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const trimmed = value.trim();
  const parts = trimmed.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return {
    full: trimmed,
    owner: parts[0],
    repo: parts[1],
  };
}

function validatePath(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "";
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("/") || trimmed.includes("..") || trimmed.includes("\\")) {
    return "";
  }

  return trimmed;
}

module.exports = async (req, res) => {
  try {
    if (!requireMethod(req, res, "POST")) {
      return undefined;
    }

    if (!requireApiKey(req, res)) {
      return undefined;
    }

    const parsed = parseJsonBody(req.body);
    if (!parsed.ok || !isPlainObject(parsed.value)) {
      return sendJson(res, 400, { ok: false, error: "invalid_json" });
    }

    const body = parsed.value;
    const repoInfo = parseRepo(body.repo);
    if (!repoInfo) {
      return sendJson(res, 400, { ok: false, error: "repo_required" });
    }

    if (!getAllowedRepos().includes(repoInfo.full)) {
      return sendJson(res, 403, { ok: false, error: "repo_not_allowed" });
    }

    const path = validatePath(body.path);
    if (!path) {
      return sendJson(res, 400, { ok: false, error: "path_required" });
    }

    const ref = typeof body.ref === "string" && body.ref.trim() ? body.ref.trim() : "main";
    const appId = process.env.GITHUB_APP_ID;
    const installationId = process.env.GITHUB_INSTALLATION_ID;
    const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n");
    if (!appId || !installationId || !privateKey) {
      return sendJson(res, 500, { ok: false, error: "github_not_configured" });
    }

    const token = await getInstallationToken(appId, installationId, privateKey);
    const data = await githubRequest(
      token,
      "GET",
      `/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(
        repoInfo.repo
      )}/contents/${encodePathForGitHub(path)}?ref=${encodeURIComponent(ref)}`
    );

    const content =
      data && data.encoding === "base64" && typeof data.content === "string"
        ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
        : null;

    return sendJson(res, 200, {
      ok: true,
      repo: repoInfo.full,
      path: data.path,
      ref,
      sha: data.sha,
      size: data.size,
      content,
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: err && err.code ? err.code : "github_api_error",
      detail: err && err.message ? err.message : "GitHub read failed",
    });
  }
};
