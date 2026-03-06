const {
  buildPlanArtifact,
  isPlainObject,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
} = require("../../_lib/founderos-v1");

module.exports = async (req, res) => {
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

  const body = parsed.value;
  const userRequest = typeof body.user_request === "string" ? body.user_request.trim() : "";
  if (!userRequest) {
    return sendJson(res, 400, { ok: false, error: "user_request_required" });
  }

  const artifact = buildPlanArtifact(userRequest, body.scope, body.constraints);
  return sendJson(res, 200, { ok: true, artifact });
};
