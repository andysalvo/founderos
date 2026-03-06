const {
  getAllowedRepos,
  isPlainObject,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
} = require("../../_lib/founderos-v1");
const { getInstallationToken, githubRequest } = require("../../_lib/github");

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

function validatePrefix(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("/") || trimmed.includes("..") || trimmed.includes("\\")) {
    return null;
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

    const pathPrefix = validatePrefix(body.path_prefix);
    if (pathPrefix === null) {
      return sendJson(res, 400, { ok: false, error: "path_prefix_invalid" });
    }

    const ref = typeof body.ref === "string" && body.ref.trim() ? body.ref.trim() : "main";
    const requestedLimit = Number(body.limit);
    const limit =
      body.limit === undefined || body.limit === null
        ? 200
        : Math.min(1000, Math.max(1, Math.trunc(requestedLimit)));
    if (!Number.isFinite(limit)) {
      return sendJson(res, 400, { ok: false, error: "limit_invalid" });
    }

    const appId = process.env.GITHUB_APP_ID;
    const installationId = process.env.GITHUB_INSTALLATION_ID;
    const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n");
    if (!appId || !installationId || !privateKey) {
      return sendJson(res, 500, { ok: false, error: "github_not_configured" });
    }

    const token = await getInstallationToken(appId, installationId, privateKey);
    const baseRef = await githubRequest(
      token,
      "GET",
      `/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(
        repoInfo.repo
      )}/git/ref/heads/${encodeURIComponent(ref)}`
    );
    const commit = await githubRequest(
      token,
      "GET",
      `/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(
        repoInfo.repo
      )}/git/commits/${encodeURIComponent(baseRef.object.sha)}`
    );
    const tree = await githubRequest(
      token,
      "GET",
      `/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(
        repoInfo.repo
      )}/git/trees/${encodeURIComponent(commit.tree.sha)}?recursive=1`
    );

    const files = Array.isArray(tree.tree)
      ? tree.tree
          .filter((item) => item && item.type === "blob")
          .filter((item) => !pathPrefix || item.path.startsWith(pathPrefix))
          .slice(0, limit)
          .map((item) => ({
            path: item.path,
            sha: item.sha,
            size: item.size || 0,
            mode: item.mode,
          }))
      : [];

    return sendJson(res, 200, {
      ok: true,
      repo: repoInfo.full,
      ref,
      path_prefix: pathPrefix || undefined,
      truncated: Boolean(tree.truncated) || (Array.isArray(tree.tree) && tree.tree.length > files.length),
      files,
    });
  } catch (err) {
    return sendJson(res, 500, {
      ok: false,
      error: err && err.code ? err.code : "github_api_error",
      detail: err && err.message ? err.message : "GitHub tree read failed",
    });
  }
};
