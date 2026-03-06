const {
  buildCapabilitiesResponse,
  requireMethod,
  sendJson,
} = require("../_lib/founderos-v1");

module.exports = (req, res) => {
  if (!requireMethod(req, res, "GET")) {
    return undefined;
  }

  return sendJson(res, 200, buildCapabilitiesResponse());
};
