const { requireApiKey, requireMethod, sendJson } = require("../../_lib/founderos-v1");
const { listTradeCandidates } = require("../../_lib/trading");

module.exports = async (req, res) => {
  try {
    if (!requireMethod(req, res, "GET")) {
      return undefined;
    }

    if (!requireApiKey(req, res)) {
      return undefined;
    }

    const query = req && req.query ? req.query : {};
    const candidates = await listTradeCandidates({
      status: query.status,
      asset: query.asset,
      execution_mode: query.execution_mode,
      limit: query.limit,
    });

    return sendJson(res, 200, { ok: true, candidates: candidates || [] });
  } catch (err) {
    return sendJson(res, err && err.code === "trading_not_configured" ? 500 : 502, {
      ok: false,
      error: err && err.code ? err.code : "trading_candidates_failed",
    });
  }
};
