const {
  buildPlanArtifact,
  isPlainObject,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
} = require("../../_lib/founderos-v1");

function normalizeUserRequest(body) {
  const candidateKeys = ["user_request", "userRequest", "request", "goal", "task", "prompt"];

  for (const key of candidateKeys) {
    if (typeof body[key] === "string" && body[key].trim()) {
      return body[key].trim();
    }
  }

  return "";
}

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
  const userRequest = normalizeUserRequest(body);
  if (!userRequest) {
    return sendJson(res, 400, { ok: false, error: "user_request_required" });
  }

  const artifact = buildPlanArtifact(userRequest, body.scope, body.constraints);
  return sendJson(res, 200, { ok: true, artifact });
};
