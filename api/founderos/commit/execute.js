const {
  isPlainObject,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
} = require("../../_lib/founderos-v1");
const {
  executeWriteSet,
  resolveWriteSetForExecution,
} = require("../../_lib/commit-execution");

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

    const body = parsed.value;
    const authorization = body.authorization;
    const resolved = await resolveWriteSetForExecution({
      writeSet: body.write_set,
      authorization,
    });
    if (!resolved.ok) {
      return sendJson(res, resolved.statusCode || 400, {
        ok: false,
        error: resolved.error,
        ...(resolved.path ? { path: resolved.path } : {}),
      });
    }

    const executed = await executeWriteSet({
      writeSet: resolved.writeSet,
      actor: resolved.actor,
      artifactId: resolved.artifactId,
      planArtifactHash: resolved.planArtifactHash,
      witnessType: "commit.execution_authorized",
      docsOnly: false,
      provenance: resolved.provenance,
    });

    return sendJson(res, 200, { ok: true, ...executed });
  } catch (err) {
    return sendJson(res, err && err.statusCode ? err.statusCode : 500, {
      ok: false,
      error: err && err.code ? err.code : "internal_error",
      ...(err && err.path ? { path: err.path } : {}),
      ...(err && err.stage ? { stage: err.stage } : {}),
      ...(err && err.code === "github_api_error" && err.message
        ? { detail: err.message }
        : {}),
    });
  }
};
