const { randomUUID, createHash } = require("crypto");

function sendJson(res, statusCode, payload, extraHeaders) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  if (extraHeaders && typeof extraHeaders === "object") {
    for (const [key, value] of Object.entries(extraHeaders)) {
      res.setHeader(key, value);
    }
  }
  return res.end(JSON.stringify(payload));
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Parse request body from Vercel (object or string); invalid JSON returns null marker.
function parseBody(body) {
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return { ok: true, value: parsed };
    } catch (_err) {
      return { ok: false };
    }
  }
  if (body === undefined || body === null) {
    return { ok: true, value: {} };
  }
  if (isPlainObject(body)) {
    return { ok: true, value: body };
  }
  return { ok: false };
}

function buildSummary(userRequest) {
  return "Proposal only: " + userRequest.trim();
}

function inferIntendedTools(userRequest) {
  const text = userRequest.toLowerCase();
  const tools = [];

  if (text.includes("file") || text.includes("code") || text.includes("readme") || text.includes("api")) {
    tools.push({
      name: "filesystem",
      purpose: "Potential future file changes after authorization",
    });
  }

  if (text.includes("test") || text.includes("verify") || text.includes("check")) {
    tools.push({
      name: "test-runner",
      purpose: "Potential future validation after authorization",
    });
  }

  if (tools.length === 0) {
    tools.push({
      name: "filesystem",
      purpose: "Potential future file changes after authorization",
    });
  }

  return tools;
}

function inferIntendedWrites(userRequest) {
  const text = userRequest.toLowerCase();
  let action = "update";

  if (text.includes("create") || text.includes("add")) {
    action = "create";
  } else if (text.includes("delete") || text.includes("remove")) {
    action = "delete";
  }

  return [
    {
      path: "TBD_BY_AUTHORIZED_IMPLEMENTATION",
      action,
      summary: "Potential code or documentation changes inferred from the request",
    },
  ];
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(
      res,
      405,
      { ok: false, error: "method_not_allowed" },
      { Allow: "POST" }
    );
  }

  const key = req.headers["x-founderos-key"];
  if (!key || key !== process.env.FOUNDEROS_WRITE_KEY) {
    return sendJson(res, 401, { ok: false, error: "unauthorized" });
  }

  const parsed = parseBody(req.body);
  if (!parsed.ok || !isPlainObject(parsed.value)) {
    return sendJson(res, 400, { ok: false, error: "invalid_json" });
  }

  const body = parsed.value;
  const userRequest = typeof body.user_request === "string" ? body.user_request.trim() : "";
  if (!userRequest) {
    return sendJson(res, 400, { ok: false, error: "user_request_required" });
  }

  const scopeInput = isPlainObject(body.scope) ? body.scope : {};
  const scope = {
    repo: typeof scopeInput.repo === "string" ? scopeInput.repo : "",
    branch: typeof scopeInput.branch === "string" ? scopeInput.branch : "",
    allowed_paths: Array.isArray(scopeInput.allowed_paths) ? scopeInput.allowed_paths : [],
    forbidden_paths: Array.isArray(scopeInput.forbidden_paths) ? scopeInput.forbidden_paths : [],
  };

  const constraints = Array.isArray(body.constraints) ? body.constraints : [];

  // Pre-commit proposal artifact only; no execution, writes, or external calls.
  const artifactWithoutHash = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    human_readable_summary: buildSummary(userRequest),
    intended_tools: inferIntendedTools(userRequest),
    intended_writes: inferIntendedWrites(userRequest),
    constraints,
    scope,
  };

  const contentHash = createHash("sha256")
    .update(JSON.stringify(artifactWithoutHash))
    .digest("hex");

  const artifact = {
    ...artifactWithoutHash,
    content_hash: contentHash,
  };

  return sendJson(res, 200, { ok: true, artifact });
};
