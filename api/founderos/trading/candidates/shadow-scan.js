const {
  isPlainObject,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
} = require("../../../_lib/founderos-v1");
const { createShadowScanCandidate } = require("../../../_lib/trading");

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

    const result = await createShadowScanCandidate(parsed.value);
    return sendJson(res, 200, result);
  } catch (err) {
    const statusCode =
      err &&
      [
        "shadow_scan_candles_required",
        "shadow_scan_provider_invalid",
        "shadow_scan_paper_only",
        "shadow_scan_strategy_invalid",
        "shadow_scan_asset_invalid",
        "shadow_scan_timeframe_invalid",
      ].includes(err.code)
        ? 400
        : err && err.code === "trading_not_configured"
          ? 500
          : 502;

    return sendJson(res, statusCode, {
      ok: false,
      error: err && err.code ? err.code : "trading_shadow_scan_failed",
    });
  }
};
