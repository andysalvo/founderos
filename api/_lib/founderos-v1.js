const { createHash } = require("crypto");
const { getRuntimeContext } = require("./runtime");

const VERSION = "1.0.0";
const SERVICE_NAME = "founderos-control-plane";
const AUTH_HEADER = "x-founderos-key";
const WORKER_AUTH_HEADER = "x-founderos-worker-key";
const OPENAPI_PATH = "docs/openapi.founderos.yaml";
const OPENAPI_VERSION = "3.1.0";

const ENDPOINTS = [
  {
    operationId: "health",
    method: "GET",
    path: "/api/founderos/health",
    auth: "public",
    purpose: "Liveness check for Vercel and GPT Action validation.",
  },
  {
    operationId: "capabilities",
    method: "GET",
    path: "/api/founderos/capabilities",
    auth: "public",
    purpose: "Describe the exact v1 contract and commitment boundary without write access.",
  },
  {
    operationId: "capabilitiesCheck",
    method: "POST",
    path: "/api/founderos/capabilities/check",
    auth: "apiKey",
    purpose: "POST mirror of capabilities for GPT Action auth diagnostics and compatibility.",
  },
  {
    operationId: "precommitPlan",
    method: "POST",
    path: "/api/founderos/precommit/plan",
    auth: "apiKey",
    purpose: "Return a proposal artifact only. No durable writes or external side effects.",
  },
  {
    operationId: "repoFile",
    method: "POST",
    path: "/api/founderos/repo/file",
    auth: "apiKey",
    purpose: "Read one file from an allowlisted GitHub repo via server-side GitHub App auth.",
  },
  {
    operationId: "repoTree",
    method: "POST",
    path: "/api/founderos/repo/tree",
    auth: "apiKey",
    purpose: "List files from an allowlisted GitHub repo via server-side GitHub App auth.",
  },
  {
    operationId: "freezeWriteSet",
    method: "POST",
    path: "/api/founderos/commit/freeze-write-set",
    auth: "apiKey",
    purpose: "Persist one exact canonical write set server-side so commit.execute can execute by frozen artifact id.",
  },
  {
    operationId: "commitExecute",
    method: "POST",
    path: "/api/founderos/commit/execute",
    auth: "apiKey",
    purpose: "Execute one exact, pre-authorized write set against an allowlisted GitHub repo.",
  },
  {
    operationId: "commitMergePr",
    method: "POST",
    path: "/api/founderos/commit/merge-pr",
    auth: "apiKey",
    purpose:
      "Merge one explicitly authorized pull request through APS under narrow repo, check, and branch-protection policy.",
  },
  {
    operationId: "orchestrateSubmit",
    method: "POST",
    path: "/api/founderos/orchestrate/submit",
    auth: "apiKey",
    purpose: "Create an async orchestration job for worker execution through APS.",
  },
  {
    operationId: "orchestrateJobStatus",
    method: "GET",
    path: "/api/founderos/orchestrate/jobs/{job_id}",
    auth: "apiKey",
    purpose: "Read durable status, artifacts, and recent events for one orchestration job.",
  },
];

const POLICY_BEARING_PATH_RULES = [
  {
    match: "prefix",
    path: "api/founderos/",
    artifact_type: "capability_surface_definition",
    enforcement: "protected",
  },
  {
    match: "prefix",
    path: "api/_lib/",
    artifact_type: "aps_control_plane_logic",
    enforcement: "protected",
  },
  {
    match: "exact",
    path: "docs/openapi.founderos.yaml",
    artifact_type: "capability_surface_definition",
    enforcement: "protected",
  },
  {
    match: "exact",
    path: "docs/GPT_INSTRUCTIONS.md",
    artifact_type: "gpt_instructions",
    enforcement: "protected",
  },
  {
    match: "exact",
    path: "docs/BOUNDARIES.md",
    artifact_type: "protected_path_rules",
    enforcement: "protected",
  },
  {
    match: "exact",
    path: "docs/FOUNDEROS_SYSTEM_SPEC.md",
    artifact_type: "authority_system_spec",
    enforcement: "protected",
  },
  {
    match: "exact",
    path: "docs/GPT_BUILDER_SETUP.md",
    artifact_type: "identity_auth_policy",
    enforcement: "protected",
  },
  {
    match: "prefix",
    path: "infra/supabase/",
    artifact_type: "provenance_policy",
    enforcement: "protected",
  },
  {
    match: "prefix",
    path: ".github/workflows/",
    artifact_type: "automation_authority_surface",
    enforcement: "protected",
  },
  {
    match: "prefix",
    path: ".env",
    artifact_type: "secret_material",
    enforcement: "protected",
  },
  {
    match: "exact",
    path: "vercel.json",
    artifact_type: "deployment_authority_surface",
    enforcement: "protected",
  },
  {
    match: "prefix",
    path: "memory/decisions/",
    artifact_type: "authority_shaping_decision_artifact",
    enforcement: "review_required",
  },
  {
    match: "prefix",
    path: "services/openclaw/",
    artifact_type: "worker_identity_auth_policy",
    enforcement: "review_required",
  },
  {
    match: "exact",
    path: "docs/FOUNDEROS_LIVE_STATE.md",
    artifact_type: "runtime_truth_surface",
    enforcement: "review_required",
  },
];

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

function parseJsonBody(body) {
  if (typeof body === "string") {
    try {
      return { ok: true, value: JSON.parse(body) };
    } catch (_err) {
      return { ok: false };
    }
  }

  if (Buffer.isBuffer(body)) {
    try {
      return { ok: true, value: JSON.parse(body.toString("utf8")) };
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

function requireMethod(req, res, method) {
  if (req.method === method) {
    return true;
  }

  sendJson(res, 405, { ok: false, error: "method_not_allowed" }, { Allow: method });
  return false;
}

function extractApiKey(req) {
  return extractHeaderKey(req, AUTH_HEADER);
}

function extractWorkerKey(req) {
  return extractHeaderKey(req, WORKER_AUTH_HEADER);
}

function extractHeaderKey(req, headerName) {
  const headers = req && req.headers ? req.headers : {};
  const direct = typeof headers[headerName] === "string" ? headers[headerName].trim() : "";
  if (direct) {
    return direct;
  }

  const authorization =
    typeof headers.authorization === "string" ? headers.authorization.trim() : "";
  if (!authorization) {
    return "";
  }

  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch && bearerMatch[1]) {
    return bearerMatch[1].trim();
  }

  return authorization;
}

function readOptionalHeader(req, headerName) {
  const headers = req && req.headers ? req.headers : {};
  const value = typeof headers[headerName] === "string" ? headers[headerName].trim() : "";
  return value || "";
}

function detectAuthTransport(req) {
  return detectHeaderTransport(req, AUTH_HEADER);
}

function detectWorkerAuthTransport(req) {
  return detectHeaderTransport(req, WORKER_AUTH_HEADER);
}

function detectHeaderTransport(req, headerName) {
  const headers = req && req.headers ? req.headers : {};
  const direct = typeof headers[headerName] === "string" ? headers[headerName].trim() : "";
  if (direct) {
    return headerName;
  }

  const authorization =
    typeof headers.authorization === "string" ? headers.authorization.trim() : "";
  if (!authorization) {
    return "none";
  }

  return /^Bearer\s+.+$/i.test(authorization) ? "authorization-bearer" : "authorization";
}

function requireApiKey(req, res) {
  const provided = extractApiKey(req);
  const configured = getConfiguredPublicWriteKey();
  if (provided && configured && provided === configured) {
    return true;
  }

  sendJson(res, 401, {
    ok: false,
    error: "unauthorized",
    auth_received_via: detectAuthTransport(req),
    expected_key_configured: Boolean(configured),
  });
  return false;
}

function requireWorkerKey(req, res) {
  const provided = extractWorkerKey(req);
  if (provided && provided === process.env.FOUNDEROS_WORKER_KEY) {
    return true;
  }

  sendJson(res, 401, {
    ok: false,
    error: "worker_unauthorized",
    auth_received_via: detectWorkerAuthTransport(req),
    expected_key_configured: Boolean(process.env.FOUNDEROS_WORKER_KEY),
  });
  return false;
}

function hashJson(value) {
  return createHash("sha256").update(stableJsonStringify(value)).digest("hex");
}

function stableJsonStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasControlCharacters(value, allowNewlines) {
  if (typeof value !== "string") {
    return true;
  }

  return allowNewlines
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)
    : /[\u0000-\u001F\u007F]/.test(value);
}

function validateIdentifier(value, options = {}) {
  const {
    allowSlash = false,
    allowSpaces = false,
    allowColon = false,
    maxLength = 200,
  } = options;

  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || hasControlCharacters(trimmed, false)) {
    return "";
  }

  let allowed = "A-Za-z0-9._@";
  if (allowSlash) {
    allowed += "/";
  }
  if (allowSpaces) {
    allowed += " ";
  }
  if (allowColon) {
    allowed += ":";
  }
  allowed += "-";

  const pattern = new RegExp(`^[${allowed}]+$`);
  return pattern.test(trimmed) ? trimmed : "";
}

function validateModelIdentity(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200 || hasControlCharacters(trimmed, false)) {
    return null;
  }

  return trimmed;
}

function parseRepoSlug(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const parts = trimmed.split("/");
  if (
    parts.length !== 2 ||
    !parts[0] ||
    !parts[1] ||
    !/^[A-Za-z0-9_.-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_.-]+$/.test(parts[1])
  ) {
    return null;
  }

  return {
    full: trimmed,
    owner: parts[0],
    repo: parts[1],
  };
}

function validateRelativeRepoPath(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith("/") ||
    trimmed.includes("..") ||
    trimmed.includes("\\") ||
    hasControlCharacters(trimmed, false)
  ) {
    return "";
  }

  return trimmed;
}

function validateTreePrefix(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (
    trimmed.startsWith("/") ||
    trimmed.includes("..") ||
    trimmed.includes("\\") ||
    hasControlCharacters(trimmed, false)
  ) {
    return null;
  }

  return trimmed;
}

function validateGitRefName(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > 255 ||
    trimmed.startsWith("/") ||
    trimmed.endsWith("/") ||
    trimmed.startsWith(".") ||
    trimmed.endsWith(".") ||
    trimmed.endsWith(".lock") ||
    trimmed.includes("..") ||
    trimmed.includes("//") ||
    trimmed.includes("@{") ||
    /[\u0000-\u001F\u007F ~^:?*[\]\\]/.test(trimmed)
  ) {
    return "";
  }

  return /^[A-Za-z0-9._/-]+$/.test(trimmed) ? trimmed : "";
}

function validateMutationText(value, options = {}) {
  const {
    multiline = false,
    required = true,
    maxLength = multiline ? 6000 : 300,
    trim = true,
  } = options;

  if (value === undefined || value === null) {
    return required ? "" : null;
  }

  if (typeof value !== "string") {
    return "";
  }

  const normalized = trim ? value.trim() : value;
  if (!normalized && required) {
    return "";
  }
  if (!normalized && !required) {
    return null;
  }
  if (normalized.length > maxLength || hasControlCharacters(normalized, multiline)) {
    return "";
  }

  return normalized;
}

function validatePullNumber(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function pathMatchesRule(path, rule) {
  if (rule.match === "exact") {
    return path === rule.path;
  }

  return path === rule.path || path.startsWith(rule.path);
}

function classifyPolicyBearingPath(path) {
  if (typeof path !== "string" || path.length === 0) {
    return null;
  }

  return POLICY_BEARING_PATH_RULES.find((rule) => pathMatchesRule(path, rule)) || null;
}

function normalizeScope(raw) {
  const scope = isPlainObject(raw) ? raw : {};
  return {
    repo: typeof scope.repo === "string" ? scope.repo.trim() : "",
    branch: typeof scope.branch === "string" ? scope.branch.trim() : "",
    allowed_paths: normalizeStringList(scope.allowed_paths),
    forbidden_paths: normalizeStringList(scope.forbidden_paths),
  };
}

function inferIntendedTools(userRequest) {
  const text = userRequest.toLowerCase();
  const tools = [];

  if (text.includes("readme") || text.includes("docs") || text.includes("openapi")) {
    tools.push({
      name: "documentation-review",
      purpose: "Assess documentation or schema updates without writing files.",
    });
  }

  if (text.includes("api") || text.includes("endpoint") || text.includes("route")) {
    tools.push({
      name: "api-surface-review",
      purpose: "Assess API changes without executing them.",
    });
  }

  if (text.includes("test") || text.includes("verify") || text.includes("validate")) {
    tools.push({
      name: "contract-validation",
      purpose: "Plan validation steps that still require explicit execution approval later.",
    });
  }

  if (tools.length === 0) {
    tools.push({
      name: "repo-review",
      purpose: "Summarize the request and identify likely code or doc touch points.",
    });
  }

  return tools;
}

function inferIntendedWrites(userRequest) {
  const text = userRequest.toLowerCase();
  let action = "update";

  if (text.includes("create") || text.includes("add")) {
    action = "create";
  } else if (text.includes("delete") || text.includes("remove") || text.includes("archive")) {
    action = "delete";
  }

  return [
    {
      path: "TBD_BY_AUTHORIZED_WRITE_SET",
      action,
      summary: "Placeholder only. Exact bytes and paths must be supplied later in commit.execute.",
    },
  ];
}

function isProtectedPath(path) {
  const rule = classifyPolicyBearingPath(path);
  return Boolean(rule && rule.enforcement === "protected");
}

function buildPlanArtifact(userRequest, rawScope, rawConstraints) {
  const scope = normalizeScope(rawScope);
  const constraints = normalizeStringList(rawConstraints);
  const scopedArtifacts = [...scope.allowed_paths, ...scope.forbidden_paths]
    .map((path) => ({ path, rule: classifyPolicyBearingPath(path) }))
    .filter((item) => item.rule);
  const protectedWarnings = scopedArtifacts.filter((item) => item.rule.enforcement === "protected");
  const reviewWarnings = scopedArtifacts.filter((item) => item.rule.enforcement !== "protected");
  const warnings = [];

  if (protectedWarnings.length > 0) {
    warnings.push(
      "Protected policy-bearing artifacts appeared in the provided scope. commit.execute will reject them unless a future constitutional change opens a narrower path."
    );
  }
  if (reviewWarnings.length > 0) {
    warnings.push(
      "Policy-bearing artifacts appeared in the provided scope. Treat them as governance-bearing, not ordinary content, even when they are not auto-blocked."
    );
  }

  const artifactWithoutHash = {
    id: `plan_${Date.now()}`,
    created_at: new Date().toISOString(),
    mode: "proposal_only",
    human_readable_summary: `Proposal only: ${userRequest.trim()}`,
    intended_tools: inferIntendedTools(userRequest),
    intended_writes: inferIntendedWrites(userRequest),
    constraints,
    scope,
    warnings,
    next_step:
      "A human must review this artifact, freeze an exact write_set, and send explicit authorization before commit.execute.",
  };

  return {
    ...artifactWithoutHash,
    content_hash: hashJson(artifactWithoutHash),
  };
}

function getAllowedRepos() {
  return (process.env.ALLOWED_REPOS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getConfiguredPublicWriteKey() {
  return process.env.FOUNDEROS_PUBLIC_WRITE_KEY || process.env.FOUNDEROS_WRITE_KEY || "";
}

function buildCapabilitiesResponse() {
  const runtime = getRuntimeContext();
  return {
    ok: true,
    service: SERVICE_NAME,
    version: VERSION,
    runtime,
    openapi: {
      path: OPENAPI_PATH,
      version: OPENAPI_VERSION,
    },
    auth: {
      type: "apiKey",
      header: AUTH_HEADER,
      configured: Boolean(getConfiguredPublicWriteKey()),
      env:
        process.env.FOUNDEROS_PUBLIC_WRITE_KEY
          ? "FOUNDEROS_PUBLIC_WRITE_KEY"
          : process.env.FOUNDEROS_WRITE_KEY
            ? "FOUNDEROS_WRITE_KEY"
            : null,
      compatibility_fallback_active:
        Boolean(process.env.FOUNDEROS_WRITE_KEY) &&
        !Boolean(process.env.FOUNDEROS_PUBLIC_WRITE_KEY),
    },
    worker_auth: {
      type: "apiKey",
      header: WORKER_AUTH_HEADER,
      configured: Boolean(process.env.FOUNDEROS_WORKER_KEY),
    },
    boundaries: {
      narrow_commitment_boundary: true,
      planning_only_precommit: true,
      explicit_authorization_required: true,
      protected_path_policy_enforced: true,
      policy_bearing_artifact_classification: true,
      witness_before_write_required: true,
      server_side_secret_handling: true,
      worker_lane_separated: true,
      deterministic_mutation_translation_required: true,
      governed_pr_merge_available: true,
    },
    protected_paths: POLICY_BEARING_PATH_RULES
      .filter((rule) => rule.enforcement === "protected")
      .map((rule) => {
        if (rule.match !== "prefix") {
          return rule.path;
        }

        return rule.path.endsWith("/")
          ? `${rule.path}**`
          : `${rule.path}*`;
      }),
    policy_bearing_artifacts: POLICY_BEARING_PATH_RULES.map((rule) => ({
      match: rule.match,
      path: rule.path,
      artifact_type: rule.artifact_type,
      enforcement: rule.enforcement,
    })),
    allowed_repos: getAllowedRepos(),
    endpoints: ENDPOINTS,
  };
}

module.exports = {
  AUTH_HEADER,
  WORKER_AUTH_HEADER,
  ENDPOINTS,
  OPENAPI_PATH,
  OPENAPI_VERSION,
  SERVICE_NAME,
  VERSION,
  buildCapabilitiesResponse,
  buildPlanArtifact,
  classifyPolicyBearingPath,
  detectAuthTransport,
  detectWorkerAuthTransport,
  extractApiKey,
  getConfiguredPublicWriteKey,
  extractWorkerKey,
  getAllowedRepos,
  hashJson,
  isPlainObject,
  isProtectedPath,
  parseRepoSlug,
  readOptionalHeader,
  normalizeStringList,
  parseJsonBody,
  requireApiKey,
  requireWorkerKey,
  requireMethod,
  sendJson,
  validateGitRefName,
  validateIdentifier,
  validateModelIdentity,
  validateMutationText,
  validatePullNumber,
  validateRelativeRepoPath,
  validateTreePrefix,
};
