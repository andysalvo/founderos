const {
  isPlainObject,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
} = require("../../_lib/founderos-v1");
const { freezeWriteSet, validateWriteSet } = require("../../_lib/commit-execution");

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
    const validation = validateWriteSet(writeSet);
    if (!validation.ok) {
      return sendJson(res, validation.statusCode || 400, {
        ok: false,
        error: validation.error,
        ...(validation.path ? { path: validation.path } : {}),
      });
    }

    if (typeof body.plan_artifact_id !== "string" || body.plan_artifact_id.length === 0) {
      return sendJson(res, 400, { ok: false, error: "plan_artifact_id_required" });
    }

    if (typeof body.plan_artifact_hash !== "string" || body.plan_artifact_hash.length === 0) {
      return sendJson(res, 400, { ok: false, error: "plan_artifact_hash_required" });
    }

    if (typeof body.frozen_by !== "string" || body.frozen_by.length === 0) {
      return sendJson(res, 400, { ok: false, error: "frozen_by_required" });
    }

    const artifact = await freezeWriteSet({
      writeSet,
      actor: body.frozen_by,
      planArtifactId: body.plan_artifact_id,
      planArtifactHash: body.plan_artifact_hash,
    });

    return sendJson(res, 200, {
      ok: true,
      artifact: {
        id: artifact.id,
        type: artifact.type,
        content_hash: artifact.content_hash,
        write_set_hash: artifact.write_set_hash,
        repo: artifact.write_set.repo,
        branch_name: artifact.write_set.branch_name,
        base_branch: artifact.write_set.base_branch,
        files_written: artifact.write_set.files.length,
      },
    });
  } catch (err) {
    return sendJson(res, err && err.statusCode ? err.statusCode : 500, {
      ok: false,
      error: err && err.code ? err.code : "internal_error",
      ...(err && err.path ? { path: err.path } : {}),
    });
  }
};
