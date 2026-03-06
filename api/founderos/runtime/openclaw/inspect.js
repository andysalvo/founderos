const { randomUUID } = require("crypto");

const {
  extractApiKey,
  isPlainObject,
  parseJsonBody,
  sendJson,
} = require("../../../_lib/founderos-v1");

const ALLOWED_FIELDS = new Set(["task", "repo", "branch", "context"]);
const EXECUTION_FIELDS = new Set([
  "authorization",
  "write_set",
  "files",
  "changes",
  "mode",
  "commit",
  "execute",
  "apply",
]);
const ACTUATION_PATTERNS = [
  /\bcommit\b\s+(?:the|this|that|a|an|my|our)?\s*(?:change|changes|file|files|code|plan|write\s*set|writes?)\b/i,
  /\bexecute\b\s+(?:the|this|that|a|an|my|our)?\s*(?:plan|change|changes|write\s*set|commit|execution)\b/i,
  /\bapply\b\s+(?:the|this|that|a|an|my|our)?\s*(?:change|changes|patch|plan|fix|update)\b/i,
  /\bwrite\b\s+(?:the|this|that|a|an|my|our)?\s*(?:file|files|code|patch|update|change|changes|pr)\b/i,
  /\bedit\b\s+(?:the|this|that|a|an|my|our)?\s*(?:file|files|code|patch|update|change|changes)\b/i,
  /\bmodify\b\s+(?:the|this|that|a|an|my|our)?\s*(?:file|files|code|patch|update|change|changes)\b/i,
  /\bdelete\b\s+(?:the|this|that|a|an|my|our)?\s*(?:file|files|code|branch|repo|repository|change|changes)\b/i,
  /\bpush\b\s+(?:the|this|that|a|an|my|our)?\s*(?:branch|change|changes|commit|code)\b/i,
  /\bmerge\b\s+(?:the|this|that|a|an|my|our)?\s*(?:pr|pull request|branch|changes)\b/i,
  /\bdeploy\b(?:\s+(?:the|this|that|a|an|my|our)?\s*(?:app|change|changes|branch|update))?\b/i,
  /\bcreate\s+pr\b/i,
  /\bopen\s+pr\b/i,
];

function sendOpenClawJson(res, statusCode, requestId, payload, extraHeaders) {
  return sendJson(
    res,
    statusCode,
    {
      ...payload,
      request_id: requestId,
    },
    extraHeaders
  );
}

function normalizeText(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (isPlainObject(value)) {
    for (const key of ["summary", "title", "text", "message", "description", "content"]) {
      if (typeof value[key] === "string" && value[key].trim()) {
        return value[key].trim();
      }
    }
  }

  return "";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeText(item)).filter(Boolean);
}

function buildCandidateObjects(value) {
  if (!isPlainObject(value)) {
    return [];
  }

  const candidates = [value];
  for (const key of ["result", "analysis", "output", "data"]) {
    if (isPlainObject(value[key])) {
      candidates.push(value[key]);
    }
  }
  return candidates;
}

function firstString(candidates, keys) {
  for (const candidate of candidates) {
    for (const key of keys) {
      const normalized = normalizeText(candidate[key]);
      if (normalized) {
        return normalized;
      }
    }
  }
  return "";
}

function firstStringArray(candidates, keys) {
  for (const candidate of candidates) {
    for (const key of keys) {
      const normalized = normalizeStringArray(candidate[key]);
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }
  return [];
}

function normalizeOpenClawResponse(data) {
  if (typeof data === "string" && data.trim()) {
    return {
      summary: data.trim(),
      findings: [],
      suggested_next_actions: [],
    };
  }

  const candidates = buildCandidateObjects(data);
  if (candidates.length === 0) {
    return null;
  }

  const summary = firstString(candidates, ["summary", "message", "content", "analysis", "result"]);
  const findings = firstStringArray(candidates, ["findings", "issues", "observations", "insights"]);
  const suggestedNextActions = firstStringArray(candidates, [
    "suggested_next_actions",
    "next_actions",
    "recommended_actions",
    "recommendations",
  ]);

  if (!summary && findings.length === 0 && suggestedNextActions.length === 0) {
    return null;
  }

  return {
    summary: summary || "OpenClaw analysis completed.",
    findings,
    suggested_next_actions: suggestedNextActions,
  };
}

function hasActuationIntent(text) {
  return ACTUATION_PATTERNS.some((pattern) => pattern.test(text));
}

module.exports = async (req, res) => {
  const requestId = randomUUID();

  if (req.method !== "POST") {
    return sendOpenClawJson(
      res,
      405,
      requestId,
      { ok: false, error: "method_not_allowed" },
      { Allow: "POST" }
    );
  }

  const providedKey = extractApiKey(req);
  if (!providedKey || providedKey !== process.env.FOUNDEROS_WRITE_KEY) {
    return sendOpenClawJson(res, 401, requestId, { ok: false, error: "unauthorized" });
  }

  const parsed = parseJsonBody(req.body);
  if (!parsed.ok || !isPlainObject(parsed.value)) {
    return sendOpenClawJson(res, 400, requestId, { ok: false, error: "invalid_json" });
  }

  const body = parsed.value;
  const executionFieldPresent = Object.keys(body).some((key) => EXECUTION_FIELDS.has(key));
  if (executionFieldPresent) {
    return sendOpenClawJson(res, 400, requestId, { ok: false, error: "analysis_only" });
  }

  const unknownFieldPresent = Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key));
  if (unknownFieldPresent) {
    return sendOpenClawJson(res, 400, requestId, { ok: false, error: "invalid_json" });
  }

  const task = typeof body.task === "string" ? body.task.trim() : "";
  if (!task) {
    return sendOpenClawJson(res, 400, requestId, { ok: false, error: "task_required" });
  }

  const repo = typeof body.repo === "string" ? body.repo.trim() : "";
  const branch = typeof body.branch === "string" ? body.branch.trim() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";
  if (
    (body.repo !== undefined && !repo) ||
    (body.branch !== undefined && !branch) ||
    (body.context !== undefined && !context)
  ) {
    return sendOpenClawJson(res, 400, requestId, { ok: false, error: "invalid_json" });
  }

  if (hasActuationIntent(task) || (context && hasActuationIntent(context))) {
    return sendOpenClawJson(res, 400, requestId, { ok: false, error: "analysis_only" });
  }

  const openClawBaseUrl = process.env.OPENCLAW_BASE_URL;
  const openClawApiKey = process.env.OPENCLAW_API_KEY;
  if (!openClawBaseUrl || !openClawApiKey) {
    return sendOpenClawJson(res, 500, requestId, {
      ok: false,
      error: "openclaw_not_configured",
    });
  }

  const payload = { task };
  if (repo) {
    payload.repo = repo;
  }
  if (branch) {
    payload.branch = branch;
  }
  if (context) {
    payload.context = context;
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(openClawBaseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${openClawApiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (_err) {
    return sendOpenClawJson(res, 502, requestId, {
      ok: false,
      error: "openclaw_upstream_error",
    });
  }

  if (!upstreamResponse.ok) {
    return sendOpenClawJson(res, 502, requestId, {
      ok: false,
      error: "openclaw_upstream_error",
    });
  }

  let upstreamJson;
  try {
    upstreamJson = await upstreamResponse.json();
  } catch (_err) {
    return sendOpenClawJson(res, 502, requestId, {
      ok: false,
      error: "openclaw_upstream_error",
    });
  }

  const normalized = normalizeOpenClawResponse(upstreamJson);
  if (!normalized) {
    return sendOpenClawJson(res, 502, requestId, {
      ok: false,
      error: "openclaw_upstream_error",
    });
  }

  return sendOpenClawJson(res, 200, requestId, {
    ok: true,
    runtime: "openclaw",
    mode: "analysis_only",
    summary: normalized.summary,
    findings: normalized.findings,
    suggested_next_actions: normalized.suggested_next_actions,
  });
};
