const {
  isPlainObject,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
} = require("../../_lib/founderos-v1");
const { createOrchestrationJob, normalizeSubmitBody } = require("../../_lib/orchestration");

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

    const body = normalizeSubmitBody(parsed.value);
    if (!body.user_request) {
      return sendJson(res, 400, { ok: false, error: "user_request_required" });
    }

    const created = await createOrchestrationJob(parsed.value);
    return sendJson(res, 202, { ok: true, job: created });
  } catch (err) {
    return sendJson(res, err && err.code === "orchestration_not_configured" ? 500 : 502, {
      ok: false,
      error: err && err.code ? err.code : "orchestration_submit_failed",
    });
  }
};
