const {
  isPlainObject,
  parseJsonBody,
  requireMethod,
  requireWorkerKey,
  sendJson,
} = require("../../_lib/founderos-v1");
const { executeWriteSet, validateWriteSet } = require("../../_lib/commit-execution");

module.exports = async (req, res) => {
  try {
    if (!requireMethod(req, res, "POST")) {
      return undefined;
    }

    if (!requireWorkerKey(req, res)) {
      return undefined;
    }

    const parsed = parseJsonBody(req.body);
    if (!parsed.ok || !isPlainObject(parsed.value)) {
      return sendJson(res, 400, { ok: false, error: "invalid_json" });
    }

    const body = parsed.value;
    const writeSet = body.write_set;
    const candidate = body.candidate;

    const validation = validateWriteSet(writeSet);
    if (!validation.ok) {
      return sendJson(res, validation.statusCode || 400, {
        ok: false,
        error: validation.error,
        ...(validation.path ? { path: validation.path } : {}),
      });
    }

    if (!isPlainObject(candidate)) {
      return sendJson(res, 400, { ok: false, error: "candidate_required" });
    }

    if (candidate.mode !== "exact_write_set_candidate") {
      return sendJson(res, 400, { ok: false, error: "candidate_mode_invalid" });
    }

    if (typeof candidate.title !== "string" || candidate.title.length === 0) {
      return sendJson(res, 400, { ok: false, error: "candidate_title_required" });
    }

    const workerId =
      req.headers && typeof req.headers["x-founderos-worker-id"] === "string"
        ? req.headers["x-founderos-worker-id"].trim() || "openclaw-worker"
        : "openclaw-worker";

    const executed = await executeWriteSet({
      writeSet,
      actor: workerId,
      artifactId: typeof body.plan_artifact_id === "string" ? body.plan_artifact_id : candidate.title,
      planArtifactHash: typeof body.plan_artifact_hash === "string" ? body.plan_artifact_hash : null,
      witnessType: "commit.auto_execute_authorized",
      docsOnly: true,
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
