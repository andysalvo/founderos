const { requireApiKey, requireMethod, sendJson } = require("../../../_lib/founderos-v1");
const { getTradeCandidate } = require("../../../_lib/trading");

module.exports = async (req, res) => {
  try {
    if (!requireMethod(req, res, "GET")) {
      return undefined;
    }

    if (!requireApiKey(req, res)) {
      return undefined;
    }

    const candidateId =
      req && req.query && typeof req.query.candidate_id === "string"
        ? req.query.candidate_id.trim()
        : "";
    if (!candidateId) {
      return sendJson(res, 400, { ok: false, error: "candidate_id_required" });
    }

    const record = await getTradeCandidate(candidateId);
    if (!record) {
      return sendJson(res, 404, { ok: false, error: "candidate_not_found" });
    }

    return sendJson(res, 200, { ok: true, ...record });
  } catch (err) {
    return sendJson(res, err && err.code === "trading_not_configured" ? 500 : 502, {
      ok: false,
      error: err && err.code ? err.code : "trading_candidate_failed",
    });
  }
};
