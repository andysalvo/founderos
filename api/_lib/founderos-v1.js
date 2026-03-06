const { createHash } = require("crypto");

const VERSION = "1.0.0";
const SERVICE_NAME = "founderos-control-plane";
const AUTH_HEADER = "x-founderos-key";
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
    auth: "apiKey",
    purpose: "Describe the exact v1 contract and commitment boundary.",
  },
  {
    operationId: "precommitPlan",
    method: "POST",
    path: "/api/founderos/precommit/plan",
    auth: "apiKey",
    purpose: "Return a proposal artifact only. No durable writes or external side effects.",
  },
  {
    operationId: "openclawInspect",
    method: "POST",
    path: "/api/founderos/runtime/openclaw/inspect",
    auth: "apiKey",
    purpose: "Run analysis-only OpenClaw inspection behind Founderos without changing repo state.",
  },
  {
    operationId: "commitExecute",
    method: "POST",
    path: "/api/founderos/commit/execute",
    auth: "apiKey",
    purpose: "Execute one exact, pre-authorized write set against an allowlisted GitHub repo.",
  },
];

const PROTECTED_PATH_PREFIXES = ["api/founderos/", ".github/workflows/", ".env"];
const PROTECTED_PATH_EXACT = new Set(["docs/openapi.founderos.yaml", "vercel.json"]);
const REQUIRED_ENV_VARS = [
  {
    name: "FOUNDEROS_WRITE_KEY",
    required_for: ["capabilities", "precommitPlan", "openclawInspect", "commitExecute"],
  },
  {
    name: "OPENCLAW_BASE_URL",
    required_for: ["openclawInspect"],
  },
  {
    name: "OPENCLAW_API_KEY",
    required_for: ["openclawInspect"],
  },
  {
    name: "ALLOWED_REPOS",
    required_for: ["commitExecute"],
  },
  {
    name: "GITHUB_APP_ID",
    required_for: ["commitExecute"],
  },
  {
    name: "GITHUB_INSTALLATION_ID",
    required_for: ["commitExecute"],
  },
  {
    name: "GITHUB_APP_PRIVATE_KEY",
    required_for: ["commitExecute"],
  },
  {
    name: "SUPABASE_URL",
    required_for: ["commitExecute"],
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required_for: ["commitExecute"],
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
  const headers = req && req.headers ? req.headers : {};
  const direct = typeof headers[AUTH_HEADER] === "string" ? headers[AUTH_HEADER].trim() : "";
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

function requireApiKey(req, res) {
  const provided = extractApiKey(req);
  if (provided && provided === process.env.FOUNDEROS_WRITE_KEY) {
    return true;
  }

  sendJson(res, 401, { ok: false, error: "unauthorized" });
  return false;
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
  if (typeof path !== "string" || path.length === 0) {
    return false;
  }

  if (PROTECTED_PATH_EXACT.has(path)) {
    return true;
  }

  return PROTECTED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function buildPlanArtifact(userRequest, rawScope, rawConstraints) {
  const scope = normalizeScope(rawScope);
  const constraints = normalizeStringList(rawConstraints);
  const protectedWarnings = [...scope.allowed_paths, ...scope.forbidden_paths].filter((path) =>
    isProtectedPath(path)
  );

  const artifactWithoutHash = {
    id: `plan_${Date.now()}`,
    created_at: new Date().toISOString(),
    mode: "proposal_only",
    human_readable_summary: `Proposal only: ${userRequest.trim()}`,
    intended_tools: inferIntendedTools(userRequest),
    intended_writes: inferIntendedWrites(userRequest),
    constraints,
    scope,
    warnings:
      protectedWarnings.length > 0
        ? [
            "Protected control-plane paths appeared in the provided scope. commit.execute will still reject them.",
          ]
        : [],
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

function isEnvConfigured(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

function buildOperatorInputs() {
  const required_env = REQUIRED_ENV_VARS.map((item) => ({
    name: item.name,
    required_for: item.required_for,
    configured: isEnvConfigured(item.name),
  }));
  const missing_env = required_env.filter((item) => !item.configured).map((item) => item.name);

  return {
    required_env,
    missing_env,
    readiness: {
      planning_ready: isEnvConfigured("FOUNDEROS_WRITE_KEY"),
      openclaw_runtime_ready:
        isEnvConfigured("OPENCLAW_BASE_URL") && isEnvConfigured("OPENCLAW_API_KEY"),
      commit_ready: REQUIRED_ENV_VARS.every((item) => {
        if (!item.required_for.includes("commitExecute")) {
          return true;
        }
        return isEnvConfigured(item.name);
      }),
      gpt_action_ready: isEnvConfigured("FOUNDEROS_WRITE_KEY"),
    },
    next_operator_steps:
      missing_env.length > 0
        ? [
            "Add the missing environment variables in Vercel.",
            "Update the GPT Action API key to match FOUNDEROS_WRITE_KEY after any rotation.",
            "Call GET /api/founderos/capabilities again to confirm readiness before commit execution.",
          ]
        : [
            "GPT planning is ready.",
            "Commit execution is configured if the listed repo is in ALLOWED_REPOS.",
          ],
  };
}

function buildCapabilitiesResponse() {
  return {
    ok: true,
    service: SERVICE_NAME,
    version: VERSION,
    openapi: {
      path: OPENAPI_PATH,
      version: OPENAPI_VERSION,
    },
    auth: {
      type: "apiKey",
      header: AUTH_HEADER,
      configured: Boolean(process.env.FOUNDEROS_WRITE_KEY),
    },
    boundaries: {
      narrow_commitment_boundary: true,
      planning_only_precommit: true,
      explicit_authorization_required: true,
      protected_path_policy_enforced: true,
      witness_before_write_required: true,
      server_side_secret_handling: true,
    },
    protected_paths: [
      "api/founderos/**",
      "docs/openapi.founderos.yaml",
      ".env*",
      ".github/workflows/**",
      "vercel.json",
    ],
    allowed_repos: getAllowedRepos(),
    operator_inputs: buildOperatorInputs(),
    endpoints: ENDPOINTS,
  };
}

module.exports = {
  AUTH_HEADER,
  ENDPOINTS,
  extractApiKey,
  OPENAPI_PATH,
  OPENAPI_VERSION,
  SERVICE_NAME,
  VERSION,
  buildCapabilitiesResponse,
  buildOperatorInputs,
  buildPlanArtifact,
  getAllowedRepos,
  hashJson,
  isPlainObject,
  isProtectedPath,
  parseJsonBody,
  requireApiKey,
  requireMethod,
  sendJson,
};
