const { requireApiKey, requireMethod, sendJson } = require("../../../_lib/founderos-v1");
const { getConnectorHealth } = require("../../../_lib/trading");

module.exports = async (req, res) => {
  if (!requireMethod(req, res, "GET")) {
    return undefined;
  }

  if (!requireApiKey(req, res)) {
    return undefined;
  }

  return sendJson(res, 200, {
    ok: true,
    ...getConnectorHealth(),
  });
};
