const {
  isPlainObject,
  parseJsonBody,
  parseRepoSlug,
  requireApiKey,
  requireMethod,
  sendJson,
  validateGitRefName,
  validateRelativeRepoPath,
  getAllowedRepos,
} = require("../../_lib/founderos-v1");
const {
  encodePathForGitHub,
  getInstallationToken,
  githubRequest,
} = require("../../_lib/github");

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
    const repoInfo = parseRepoSlug(body.repo);
    if (!repoInfo) {
      return sendJson(res, 400, { ok: false, error: "repo_required" });
    }

    if (!getAllowedRepos().includes(repoInfo.full)) {
      return sendJson(res, 403, { ok: false, error: "repo_not_allowed" });
    }

    const path = validateRelativeRepoPath(body.path);
    if (!path) {
      return sendJson(res, 400, { ok: false, error: "path_required" });
    }

    const ref = body.ref === undefined ? "main" : validateGitRefName(body.ref);
    if (!ref) {
      return sendJson(res, 400, { ok: false, error: "ref_invalid" });
    }
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
