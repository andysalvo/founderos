const {
  isPlainObject,
  parseJsonBody,
  requireMethod,
  requireWorkerKey,
  sendJson,
} = require("../../_lib/founderos-v1");
const { claimNextQueuedJob } = require("../../_lib/orchestration");

module.exports = async (req, res) => {
  try {
    if (!requireMethod(req, res, "POST")) {
      return undefined;
    }

    if (!requireWorkerKey(req, res)) {
      return undefined;
    }

    const parsed = parseJsonBody(req.body);
    if (!parsed.ok || !isPlainObject(parsed.value)) {
      return sendJson(res, 400, { ok: false, error: "invalid_json" });
    }

    const workerId =
      req &&
      req.headers &&
      typeof req.headers["x-founderos-worker-id"] === "string" &&
      req.headers["x-founderos-worker-id"].trim()
        ? req.headers["x-founderos-worker-id"].trim()
        : "openclaw-worker";

    const job = await claimNextQueuedJob(workerId, parsed.value);
    if (!job) {
      return sendJson(res, 200, { ok: true, job: null });
    }

    return sendJson(res, 200, { ok: true, job });
  } catch (err) {
    return sendJson(res, err && err.code === "orchestration_not_configured" ? 500 : 502, {
      ok: false,
      error: err && err.code ? err.code : "orchestration_claim_failed",
    });
  }
};
