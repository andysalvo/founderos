const { requireApiKey, requireMethod, sendJson } = require("../../../_lib/founderos-v1");
const { getBacktestRun } = require("../../../_lib/trading");

module.exports = async (req, res) => {
  try {
    if (!requireMethod(req, res, "GET")) {
      return undefined;
    }

    if (!requireApiKey(req, res)) {
      return undefined;
    }

    const runId =
      req && req.query && typeof req.query.run_id === "string" ? req.query.run_id.trim() : "";
    if (!runId) {
      return sendJson(res, 400, { ok: false, error: "run_id_required" });
    }

    const run = await getBacktestRun(runId);
    if (!run) {
      return sendJson(res, 404, { ok: false, error: "backtest_not_found" });
    }

    return sendJson(res, 200, { ok: true, run });
  } catch (err) {
    return sendJson(res, err && err.code === "trading_not_configured" ? 500 : 502, {
      ok: false,
      error: err && err.code ? err.code : "trading_backtest_failed",
    });
  }
};
