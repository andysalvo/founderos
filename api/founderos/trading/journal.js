const { requireApiKey, requireMethod, sendJson } = require("../../_lib/founderos-v1");
const { listTradeJournal } = require("../../_lib/trading");

module.exports = async (req, res) => {
  try {
    if (!requireMethod(req, res, "GET")) {
      return undefined;
    }

    if (!requireApiKey(req, res)) {
      return undefined;
    }

    const query = req && req.query ? req.query : {};
    const entries = await listTradeJournal({
      asset: query.asset,
      status: query.status,
      limit: query.limit,
    });

    return sendJson(res, 200, { ok: true, entries: entries || [] });
  } catch (err) {
    return sendJson(res, err && err.code === "trading_not_configured" ? 500 : 502, {
      ok: false,
      error: err && err.code ? err.code : "trading_journal_failed",
    });
  }
};
