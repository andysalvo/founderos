const {
  isPlainObject,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
} = require("../../_lib/founderos-v1");
const { mergePullRequest } = require("../../_lib/commit-execution");

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
    const merged = await mergePullRequest({
      repo: body.repo,
      pullNumber: body.pull_number,
      authorization: body.authorization,
    });

    return sendJson(res, 200, { ok: true, ...merged });
  } catch (err) {
    return sendJson(res, err && err.statusCode ? err.statusCode : 500, {
      ok: false,
      error: err && err.code ? err.code : "internal_error",
      ...(err && err.stage ? { stage: err.stage } : {}),
      ...(err && err.details ? { details: err.details } : {}),
      ...(err && err.code === "github_api_error" && err.message
        ? { detail: err.message }
        : {}),
    });
  }
};
