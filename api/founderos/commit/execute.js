const {
  hashJson,
  isPlainObject,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
} = require("../../_lib/founderos-v1");
const { executeWriteSet, validateWriteSet } = require("../../_lib/commit-execution");

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
    const writeSet = body.write_set;
    const authorization = body.authorization;

    const validation = validateWriteSet(writeSet);
    if (!validation.ok) {
      return sendJson(res, validation.statusCode || 400, {
        ok: false,
        error: validation.error,
        ...(validation.path ? { path: validation.path } : {}),
      });
    }

    if (!isPlainObject(authorization)) {
      return sendJson(res, 400, { ok: false, error: "authorization_required" });
    }

    if (
      typeof authorization.plan_artifact_id !== "string" ||
      authorization.plan_artifact_id.length === 0
    ) {
      return sendJson(res, 400, { ok: false, error: "plan_artifact_id_required" });
    }

    if (
      typeof authorization.plan_artifact_hash !== "string" ||
      authorization.plan_artifact_hash.length === 0
    ) {
      return sendJson(res, 400, { ok: false, error: "plan_artifact_hash_required" });
    }

    if (
      typeof authorization.write_set_hash !== "string" ||
      authorization.write_set_hash.length === 0
    ) {
      return sendJson(res, 400, { ok: false, error: "write_set_hash_required" });
    }

    if (
      typeof authorization.authorized_by !== "string" ||
      authorization.authorized_by.length === 0
    ) {
      return sendJson(res, 400, { ok: false, error: "authorized_by_required" });
    }

    if (hashJson(writeSet) !== authorization.write_set_hash) {
      return sendJson(res, 400, { ok: false, error: "write_set_hash_mismatch" });
    }

    const executed = await executeWriteSet({
      writeSet,
      actor: authorization.authorized_by,
      artifactId: authorization.plan_artifact_id,
      planArtifactHash: authorization.plan_artifact_hash,
      witnessType: "commit.execution_authorized",
      docsOnly: false,
    });

    return sendJson(res, 200, { ok: true, ...executed });
  } catch (err) {
    return sendJson(res, err && err.statusCode ? err.statusCode : 500, {
      ok: false,
      error: err && err.code ? err.code : "internal_error",
      ...(err && err.path ? { path: err.path } : {}),
      ...(err && err.code === "github_api_error" && err.message
        ? { detail: err.message }
        : {}),
    });
  }
};
