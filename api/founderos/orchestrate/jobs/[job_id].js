const { requireApiKey, requireMethod, sendJson } = require("../../../_lib/founderos-v1");
const { getJobWithEvents } = require("../../../_lib/orchestration");

module.exports = async (req, res) => {
  try {
    if (!requireMethod(req, res, "GET")) {
      return undefined;
    }

    if (!requireApiKey(req, res)) {
      return undefined;
    }

    const jobId =
      req && req.query && typeof req.query.job_id === "string" ? req.query.job_id.trim() : "";
    if (!jobId) {
      return sendJson(res, 400, { ok: false, error: "job_id_required" });
    }

    const data = await getJobWithEvents(jobId);
    if (!data) {
      return sendJson(res, 404, { ok: false, error: "job_not_found" });
    }

    return sendJson(res, 200, { ok: true, ...data });
  } catch (err) {
    return sendJson(res, err && err.code === "orchestration_not_configured" ? 500 : 502, {
      ok: false,
      error: err && err.code ? err.code : "orchestration_status_failed",
    });
  }
};
