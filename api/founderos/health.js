const {
  SERVICE_NAME,
  VERSION,
  requireMethod,
  sendJson,
} = require("../_lib/founderos-v1");
const { getRuntimeContext } = require("../_lib/runtime");

module.exports = (req, res) => {
  if (!requireMethod(req, res, "GET")) {
    return undefined;
  }

  return sendJson(res, 200, {
    ok: true,
    service: SERVICE_NAME,
    version: VERSION,
    runtime: getRuntimeContext(),
    timestamp: new Date().toISOString(),
  });
};
