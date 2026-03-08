const {
  isPlainObject,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
} = require("../../../../_lib/founderos-v1");
const { decideTradeCandidate } = require("../../../../_lib/trading");

module.exports = async (req, res) => {
  try {
    if (!requireMethod(req, res, "POST")) {
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

    const parsed = parseJsonBody(req.body);
    if (!parsed.ok || !isPlainObject(parsed.value)) {
      return sendJson(res, 400, { ok: false, error: "invalid_json" });
    }

    const decided = await decideTradeCandidate(candidateId, parsed.value);
    if (!decided) {
      return sendJson(res, 404, { ok: false, error: "candidate_not_found" });
    }

    return sendJson(res, 200, { ok: true, ...decided });
  } catch (err) {
    const statusCode =
      err && (err.code === "decision_invalid" || err.code === "authorized_by_required")
        ? 400
        : err && err.code === "trading_not_configured"
          ? 500
          : 502;

    return sendJson(res, statusCode, {
      ok: false,
      error: err && err.code ? err.code : "trading_decision_failed",
    });
  }
};
