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

    const body = parsed.value;
    const status =
      typeof body.status === "string" && body.status.trim() ? body.status.trim() : "claimed";
    const workerId =
      req.headers && typeof req.headers["x-founderos-worker-id"] === "string"
        ? req.headers["x-founderos-worker-id"].trim() || "openclaw-worker"
        : "openclaw-worker";

    const updated = await updateJobLifecycle(jobId, workerId, status, {
      event_type: "job_heartbeat",
      event_payload: {
        status,
        message: typeof body.message === "string" ? body.message.trim() : "",
        progress: typeof body.progress === "number" ? body.progress : null,
      },
      worker_runtime: isPlainObject(body.worker_runtime) ? body.worker_runtime : null,
      model_identity: typeof body.model_identity === "string" ? body.model_identity.trim() : null,
    });

    if (!updated) {
      return sendJson(res, 404, { ok: false, error: "job_not_found" });
    }

    return sendJson(res, 200, { ok: true, job: updated });
  } catch (err) {
    return sendJson(res, err && err.code === "invalid_job_status" ? 400 : 502, {
      ok: false,
      error: err && err.code ? err.code : "orchestration_heartbeat_failed",
    });
  }
};
