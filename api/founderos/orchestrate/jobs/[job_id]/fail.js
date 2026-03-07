const {
  isPlainObject,
  parseJsonBody,
  requireMethod,
  requireWorkerKey,
  sendJson,
} = require("../../../../_lib/founderos-v1");
const { updateJobLifecycle } = require("../../../../_lib/orchestration");

module.exports = async (req, res) => {
  try {
    if (!requireMethod(req, res, "POST")) {
      return undefined;
    }

    if (!requireWorkerKey(req, res)) {
      return undefined;
    }

    const jobId =
      req && req.query && typeof req.query.job_id === "string" ? req.query.job_id.trim() : "";
    if (!jobId) {
      return sendJson(res, 400, { ok: false, error: "job_id_required" });
    }

    const parsed = parseJsonBody(req.body);
    if (!parsed.ok || !isPlainObject(parsed.value)) {
      return sendJson(res, 400, { ok: false, error: "invalid_json" });
    }

    const workerId =
      req.headers && typeof req.headers["x-founderos-worker-id"] === "string"
        ? req.headers["x-founderos-worker-id"].trim() || "openclaw-worker"
        : "openclaw-worker";

    const updated = await updateJobLifecycle(jobId, workerId, "failed", {
      event_type: "job_failed",
      event_payload: parsed.value,
      result: isPlainObject(parsed.value.result) ? parsed.value.result : {},
      worker_runtime: isPlainObject(parsed.value.worker_runtime) ? parsed.value.worker_runtime : null,
      model_identity:
        typeof parsed.value.model_identity === "string" ? parsed.value.model_identity.trim() : null,
      policy_verdict: isPlainObject(parsed.value.policy_verdict) ? parsed.value.policy_verdict : null,
    });

    if (!updated) {
      return sendJson(res, 404, { ok: false, error: "job_not_found" });
    }

    return sendJson(res, 200, { ok: true, job: updated });
  } catch (err) {
    return sendJson(res, 502, {
      ok: false,
      error: err && err.code ? err.code : "orchestration_fail_failed",
    });
  }
};
