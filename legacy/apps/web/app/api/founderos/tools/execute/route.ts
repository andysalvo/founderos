import { NextResponse } from "next/server";

import {
  githubCreatePr,
  githubGetFile,
  githubListTree,
} from "@/lib/github-tools";
import {
  FounderosInputError,
  appendToolLog,
  isAuthorizedRequest,
  isRecord,
  parseMemoryQueryInput,
  parseMemoryWriteInput,
  queryMemory,
  writeMemory,
  type ToolLogStatus,
} from "@/lib/founderos";

export const dynamic = "force-dynamic";

const SUPPORTED_TOOLS = [
  "health",
  "memory.write",
  "memory.query",
  "system.capabilities",
  "github.get_file",
  "github.list_tree",
  "github.create_pr",
  "tools.list",
  "agent.inspect_repo",
  "agent.self_improve",
] as const;

const MCP_DOC_TEMPLATE = `# MCP

FounderOS exposes MCP as a thin adapter layer.

- MCP endpoint: \`POST /api/mcp\`
- Core logic remains in \`tools.execute\`
- MCP tools call existing FounderOS endpoints and do not duplicate orchestration
`;

const OPENCLAW_BRIDGE_DOC_TEMPLATE = `# OpenClaw Bridge (Planned)

OpenClaw will connect as a runtime consumer of FounderOS MCP tools.

Connection path:
- OpenClaw -> FounderOS MCP (\`/api/mcp\`) -> FounderOS wrappers/tools.execute

Safety constraints that remain:
- \`x-founderos-key\` auth
- ALLOWED_REPOS enforcement
- PR-only repository writes
- No second orchestrator outside FounderOS
`;

const CI_WORKFLOW_TEMPLATE = `name: CI

on:
  pull_request:
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: apps/web/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test
`;

function parseAllowedRepos(): string[] {
  const raw = process.env.ALLOWED_REPOS;
  if (!raw) {
    throw new FounderosInputError("missing environment variable: ALLOWED_REPOS");
  }
  const repos = raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  if (repos.length === 0) {
    throw new FounderosInputError("ALLOWED_REPOS is empty");
  }
  return repos;
}

function parseOptionalAllowedRepos(): string[] {
  const raw = process.env.ALLOWED_REPOS;
  if (!raw) {
    return [];
  }
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function hasEnv(name: string): boolean {
  return Boolean(process.env[name] && process.env[name]?.trim().length);
}

function systemCapabilities() {
  const allowedRepos = parseOptionalAllowedRepos();
  const supabaseReady = hasEnv("SUPABASE_URL") && hasEnv("SUPABASE_SERVICE_ROLE_KEY");
  const githubReady =
    hasEnv("GITHUB_APP_ID") &&
    hasEnv("GITHUB_APP_PRIVATE_KEY") &&
    hasEnv("GITHUB_INSTALLATION_ID") &&
    allowedRepos.length > 0;
  const authReady = hasEnv("FOUNDEROS_WRITE_KEY");
  const openaiReady = hasEnv("OPENAI_API_KEY");
  const vercelRuntime = hasEnv("VERCEL") || hasEnv("VERCEL_ENV") || hasEnv("VERCEL_URL");

  const enabledTools = ["health", "tools.list", "system.capabilities"];
  if (supabaseReady) {
    enabledTools.push("memory.write", "memory.query");
  }
  if (githubReady) {
    enabledTools.push(
      "github.get_file",
      "github.list_tree",
      "github.create_pr",
      "agent.inspect_repo",
      "agent.self_improve",
    );
  }

  return {
    ok: true,
    ts: new Date().toISOString(),
    auth: {
      header: "x-founderos-key",
      configured: authReady,
    },
    integrations: {
      supabase: supabaseReady,
      github_app: githubReady,
      openai: openaiReady,
      vercel_runtime: vercelRuntime,
    },
    allowlist: {
      configured: allowedRepos.length > 0,
      repos: allowedRepos,
      repo_count: allowedRepos.length,
    },
    readiness: {
      memory: supabaseReady,
      inspect: githubReady,
      improve: githubReady,
      mcp: true,
    },
    enabled_tools: enabledTools,
  };
}

function parseOwnerRepoString(value: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = value.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new FounderosInputError("repo must be in owner/repo format");
  }
  return { owner: owner.trim(), repo: repo.trim() };
}

function normalizeToolCall(raw: Record<string, unknown>): {
  toolName: string;
  toolInput: Record<string, unknown>;
  hasInput: boolean;
} {
  const toolNameRaw =
    raw.toolName !== undefined ? raw.toolName : raw.tool_name;
  if (typeof toolNameRaw !== "string" || toolNameRaw.trim().length === 0) {
    throw new FounderosInputError("toolName is required");
  }

  const inputRaw =
    raw.toolInput !== undefined
      ? raw.toolInput
      : raw.input !== undefined
        ? raw.input
        : {};
  if (!isRecord(inputRaw)) {
    throw new FounderosInputError("toolInput/input must be a JSON object");
  }

  return {
    toolName: toolNameRaw.trim(),
    toolInput: inputRaw,
    hasInput: raw.toolInput !== undefined || raw.input !== undefined,
  };
}

function parseBooleanField(value: unknown, fieldName: string, defaultValue: boolean): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  throw new FounderosInputError(`${fieldName} must be a boolean`);
}

function parseNumberField(
  value: unknown,
  fieldName: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    throw new FounderosInputError(`${fieldName} must be a number`);
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function parseMode(value: unknown): "summary" | "self_improvement_readiness" {
  if (value === undefined || value === null || value === "") {
    return "summary";
  }
  if (value === "summary" || value === "self_improvement_readiness") {
    return value;
  }
  throw new FounderosInputError("mode must be 'summary' or 'self_improvement_readiness'");
}

function lineExists(content: string, expected: string): boolean {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .includes(expected.trim());
}

function appendLine(content: string, line: string): string {
  const withTrailingNewline = content.endsWith("\n") ? content : `${content}\n`;
  return `${withTrailingNewline}${line}\n`;
}

function branchFromGoal(goal: string): string {
  const slug = goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Date.now().toString().slice(-6);
  return `founderos-ai-${slug || "improvement"}-${suffix}`;
}

async function safeReadFile(params: { owner: string; repo: string; ref: string; path: string }) {
  try {
    const file = await githubGetFile(params);
    return typeof file.content === "string" ? file.content : null;
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("not found")) {
      return null;
    }
    throw error;
  }
}

function resolveRepoInput(input: Record<string, unknown>): {
  owner: string;
  repo: string;
  fullRepo: string;
} {
  const allowedRepos = parseAllowedRepos();
  const chosenRepo =
    typeof input.repo === "string" && input.repo.trim().length > 0
      ? input.repo.trim()
      : allowedRepos[0];
  if (!allowedRepos.map((repo) => repo.toLowerCase()).includes(chosenRepo.toLowerCase())) {
    throw new FounderosInputError(`repo not allowed: ${chosenRepo}`);
  }
  const { owner, repo } = parseOwnerRepoString(chosenRepo);
  return { owner, repo, fullRepo: `${owner}/${repo}` };
}

async function inspectRepo(input: Record<string, unknown>, logToMemory: boolean) {
  const { owner, repo, fullRepo } = resolveRepoInput(input);
  const baseBranch =
    typeof input.base_branch === "string" && input.base_branch.trim().length > 0
      ? input.base_branch.trim()
      : "main";
  const mode = parseMode(input.mode);
  const maxFiles = parseNumberField(input.max_files, "max_files", 500, 50, 2000);

  const tree = await githubListTree({ owner, repo, ref: baseBranch, limit: maxFiles });
  const fileSet = new Set(tree.files.map((file) => file.path));

  const importantPaths = [
    "package.json",
    "README.md",
    "apps/web/package.json",
    "apps/web/tsconfig.json",
    "apps/web/next.config.ts",
    "apps/web/app/api/founderos/tools/execute/route.ts",
    "apps/web/lib/github-tools.ts",
    "docs/openapi.founderos.yaml",
    ".gitignore",
    "AGENTS.md",
    "CANON.md",
    "docs/KNOWLEDGE.md",
    "docs/MCP.md",
    "docs/OPENCLAW_BRIDGE.md",
    "memory/schema.sql",
    "vercel.json",
    "apps/web/app/api/mcp/route.ts",
  ];

  const fileReads = await Promise.all(
    importantPaths.map(async (path) => {
      try {
        const content = await safeReadFile({ owner, repo, ref: baseBranch, path });
        return { path, content, error: null as string | null };
      } catch (error) {
        return {
          path,
          content: null,
          error: error instanceof Error ? error.message : "unknown error",
        };
      }
    }),
  );

  const readMap = new Map(fileReads.map((entry) => [entry.path, entry.content]));
  const readErrors = fileReads.filter((entry) => entry.error !== null);

  const capabilities = [...SUPPORTED_TOOLS];
  const gaps: string[] = [];

  const gitignore = readMap.get(".gitignore");
  if (!gitignore || !lineExists(gitignore, "knowledge/")) {
    gaps.push("`.gitignore` is missing `knowledge/` ignore rule.");
  }
  const openapi = readMap.get("docs/openapi.founderos.yaml");
  if (!openapi || !openapi.includes("agent.inspect_repo")) {
    gaps.push("OpenAPI spec does not fully describe latest tool surface.");
  }
  if (!openapi || !openapi.includes("/founderos/agent/inspect")) {
    gaps.push("OpenAPI spec is missing canonical wrapper endpoint `/founderos/agent/inspect`.");
  }
  if (!openapi || !openapi.includes("/founderos/agent/improve")) {
    gaps.push("OpenAPI spec is missing canonical wrapper endpoint `/founderos/agent/improve`.");
  }
  if (!fileSet.has("memory/schema.sql")) {
    gaps.push("Supabase schema file is missing from repository tree.");
  }
  if (!fileSet.has("apps/web/app/api/mcp/route.ts")) {
    gaps.push("MCP adapter route is missing (`/api/mcp`).");
  }
  if (!readMap.get("docs/MCP.md")) {
    gaps.push("MCP architecture doc is missing (`docs/MCP.md`).");
  }
  if (!readMap.get("docs/OPENCLAW_BRIDGE.md")) {
    gaps.push("OpenClaw bridge doc is missing (`docs/OPENCLAW_BRIDGE.md`).");
  }
  const appsWebPackage = readMap.get("apps/web/package.json");
  let hasTestScript = false;
  if (appsWebPackage) {
    try {
      const parsed = JSON.parse(appsWebPackage) as { scripts?: Record<string, string> };
      hasTestScript = Boolean(parsed.scripts?.test);
      if (!hasTestScript) {
        gaps.push("No `test` script found in apps/web/package.json.");
      }
    } catch {
      gaps.push("apps/web/package.json is not valid JSON.");
    }
  } else {
    gaps.push("apps/web/package.json could not be read.");
  }

  const hasCiWorkflow =
    fileSet.has(".github/workflows/ci.yml") || fileSet.has(".github/workflows/test.yml");
  if (!hasCiWorkflow) {
    gaps.push("No CI workflow found to run tests on pull requests.");
  }

  const readiness = {
    self_improvement: Boolean(
      capabilities.includes("agent.self_improve") &&
        capabilities.includes("github.create_pr"),
    ),
    repo_write: capabilities.includes("github.create_pr"),
    testing_loop: hasTestScript && hasCiWorkflow,
    deployment_loop: fileSet.has("vercel.json"),
  };

  const nextBuilds: string[] = [];
  if (!hasTestScript) {
    nextBuilds.push("Add a minimal automated test script and CI check.");
  }
  if (hasTestScript && !hasCiWorkflow) {
    nextBuilds.push("Add a pull-request CI workflow that runs `npm test` in apps/web.");
  }
  if (!gitignore || !lineExists(gitignore, "knowledge/")) {
    nextBuilds.push("Add `knowledge/` to `.gitignore` to keep local notes out of commits.");
  }
  if (!openapi || !openapi.includes("agent.inspect_repo")) {
    nextBuilds.push("Update OpenAPI docs so GPT Actions reflects all available tools.");
  }
  if (!fileSet.has("apps/web/app/api/mcp/route.ts")) {
    nextBuilds.push("Add a thin MCP adapter route over existing FounderOS endpoints.");
  }
  if (nextBuilds.length === 0) {
    nextBuilds.push("Run `agent.self_improve` with `dry_run=true` to generate the next safe PR.");
  }
  const prioritizedNextBuilds = nextBuilds.slice(0, 3);

  const missingText = gaps.length > 0 ? gaps.slice(0, 3).join(" ") : "No critical gaps detected.";
  const nextText = prioritizedNextBuilds.join(" | ");
  const summary =
    mode === "self_improvement_readiness"
      ? `FounderOS is ${readiness.self_improvement ? "ready" : "not ready"} to self-improve in ${fullRepo}. Testing loop is ${
          readiness.testing_loop ? "ready" : "not ready"
        }. Deployment loop is ${readiness.deployment_loop ? "ready" : "not ready"}. Gaps: ${missingText} Next best builds: ${nextText}`
      : `FounderOS can inspect repos, query/write memory, and open PR-based improvements in ${fullRepo}. Current gaps: ${missingText} Next best builds: ${nextText}`;

  const result = {
    ok: true,
    repo: fullRepo,
    capabilities,
    gaps,
    next_builds: prioritizedNextBuilds,
    readiness,
    summary,
    inspected_files: fileReads
      .filter((entry) => entry.content !== null)
      .map((entry) => entry.path),
    file_read_errors: readErrors.map((entry) => ({
      path: entry.path,
      error: entry.error,
    })),
  };

  if (logToMemory) {
    await writeMemory({
      kind: "agent.inspect_repo.run",
      title: `Inspect repo: ${fullRepo}`,
      body: JSON.stringify(
        {
          repo: fullRepo,
          base_branch: baseBranch,
          mode,
          capabilities: result.capabilities,
          gaps: result.gaps,
          next_builds: result.next_builds,
          readiness: result.readiness,
          summary: result.summary,
        },
        null,
        2,
      ),
      tags: ["agent", "inspect", "repo"],
      source: "agent.inspect_repo",
    });
  }

  return result;
}

async function planDeterministicImprovement(params: {
  owner: string;
  repo: string;
  baseBranch: string;
  goal: string;
}) {
  const gitignore = await safeReadFile({
    owner: params.owner,
    repo: params.repo,
    ref: params.baseBranch,
    path: ".gitignore",
  });
  const knowledgeDoc = await safeReadFile({
    owner: params.owner,
    repo: params.repo,
    ref: params.baseBranch,
    path: "docs/KNOWLEDGE.md",
  });
  const openapiDoc = await safeReadFile({
    owner: params.owner,
    repo: params.repo,
    ref: params.baseBranch,
    path: "docs/openapi.founderos.yaml",
  });
  const appsWebPackage = await safeReadFile({
    owner: params.owner,
    repo: params.repo,
    ref: params.baseBranch,
    path: "apps/web/package.json",
  });
  const ciWorkflow = await safeReadFile({
    owner: params.owner,
    repo: params.repo,
    ref: params.baseBranch,
    path: ".github/workflows/ci.yml",
  });
  const mcpDoc = await safeReadFile({
    owner: params.owner,
    repo: params.repo,
    ref: params.baseBranch,
    path: "docs/MCP.md",
  });
  const openclawDoc = await safeReadFile({
    owner: params.owner,
    repo: params.repo,
    ref: params.baseBranch,
    path: "docs/OPENCLAW_BRIDGE.md",
  });

  const changes: Array<{ path: string; content: string }> = [];
  const filesChanged: string[] = [];
  let rationale = "Apply smallest deterministic improvement available.";

  if (gitignore === null || !lineExists(gitignore, "knowledge/")) {
    changes.push({
      path: ".gitignore",
      content: gitignore === null ? "knowledge/\n" : appendLine(gitignore, "knowledge/"),
    });
    filesChanged.push(".gitignore");
    rationale = "Prevent accidental commits of local knowledge artifacts.";
  } else if (appsWebPackage !== null) {
    try {
      const parsed = JSON.parse(appsWebPackage) as {
        scripts?: Record<string, string>;
      };
      if (!parsed.scripts?.test) {
        const updated = {
          ...parsed,
          scripts: {
            ...(parsed.scripts ?? {}),
            test: "node --test tests/*.test.mjs",
          },
        };
        changes.push({
          path: "apps/web/package.json",
          content: `${JSON.stringify(updated, null, 2)}\n`,
        });
        filesChanged.push("apps/web/package.json");
        rationale = "Restore minimum test loop by ensuring a test script exists.";
      }
    } catch {
      // Ignore invalid JSON and continue with deterministic checks below.
    }
  }

  if (changes.length === 0 && ciWorkflow === null) {
    changes.push({
      path: ".github/workflows/ci.yml",
      content: CI_WORKFLOW_TEMPLATE,
    });
    filesChanged.push(".github/workflows/ci.yml");
    rationale = "Ensure PRs run tests in CI before merging.";
  }

  if (changes.length === 0 && mcpDoc === null) {
    changes.push({
      path: "docs/MCP.md",
      content: MCP_DOC_TEMPLATE,
    });
    filesChanged.push("docs/MCP.md");
    rationale = "Document MCP as a thin adapter over FounderOS control-plane logic.";
  }

  if (changes.length === 0 && openclawDoc === null) {
    changes.push({
      path: "docs/OPENCLAW_BRIDGE.md",
      content: OPENCLAW_BRIDGE_DOC_TEMPLATE,
    });
    filesChanged.push("docs/OPENCLAW_BRIDGE.md");
    rationale = "Document the planned OpenClaw integration boundary without changing ownership of logic.";
  }

  if (changes.length === 0 && knowledgeDoc !== null && !knowledgeDoc.includes("tools.execute")) {
    changes.push({
      path: "docs/KNOWLEDGE.md",
      content: `${knowledgeDoc.trimEnd()}

Tool surface additions:
- github.get_file
- github.list_tree
- github.create_pr
- tools.list
- agent.inspect_repo
- agent.self_improve

Architecture guardrails:
- tools.execute is the internal source of truth.
- wrapper endpoints are natural-language entrypoints.
- MCP is a thin adapter layer over existing FounderOS endpoints.
`,
    });
    filesChanged.push("docs/KNOWLEDGE.md");
    rationale = "Keep docs aligned with current tool surface for reliable reasoning.";
  }

  if (
    changes.length === 0 &&
    openapiDoc !== null &&
    (!openapiDoc.includes("/founderos/agent/inspect") ||
      !openapiDoc.includes("/founderos/agent/improve"))
  ) {
    throw new FounderosInputError(
      "OpenAPI is missing canonical wrapper paths and requires manual update.",
    );
  }

  return {
    changes,
    filesChanged,
    rationale,
    summary: `Prepared ${filesChanged.length} small change(s) for ${params.owner}/${params.repo}.`,
  };
}

async function runSelfImprove(input: Record<string, unknown>) {
  const goal = typeof input.goal === "string" ? input.goal.trim() : "";
  if (!goal) {
    throw new FounderosInputError("goal is required");
  }

  const { owner, repo, fullRepo } = resolveRepoInput(input);
  const baseBranch =
    typeof input.base_branch === "string" && input.base_branch.trim().length > 0
      ? input.base_branch.trim()
      : "main";
  const dryRun = parseBooleanField(input.dry_run, "dry_run", false);
  const inspectFirst = parseBooleanField(input.inspect_first, "inspect_first", false);

  if (inspectFirst) {
    await inspectRepo(
      {
        repo: fullRepo,
        base_branch: baseBranch,
        mode: "self_improvement_readiness",
        max_files: 500,
      },
      true,
    );
  }

  const plan = await planDeterministicImprovement({
    owner,
    repo,
    baseBranch,
    goal,
  });

  if (plan.changes.length === 0) {
    const noChangeOutput =
      dryRun
        ? {
            ok: true,
            dry_run: true,
            summary:
              "No deterministic improvements available. Baseline checks are already satisfied.",
            proposed_changes: [] as Array<{ path: string; action: string }>,
            rationale: "Repository already matches deterministic self-improvement baseline checks.",
            files_changed: [] as string[],
          }
        : {
            ok: true,
            dry_run: false,
            no_changes: true,
            summary:
              "No deterministic improvements available. No PR was created because no safe change candidate was found.",
            files_changed: [] as string[],
          };

    await writeMemory({
      kind: "agent.self_improve.run",
      title: `${dryRun ? "Self improve dry run" : "Self improve run"}: ${goal}`,
      body: JSON.stringify(
        {
          goal,
          repo: fullRepo,
          dry_run: dryRun,
          no_changes: true,
          summary: noChangeOutput.summary,
        },
        null,
        2,
      ),
      tags: ["agent", "self-improve", "no-op"],
      source: "agent.self_improve",
    });

    return noChangeOutput;
  }

  if (dryRun) {
    const dryRunOutput = {
      ok: true,
      dry_run: true,
      summary: plan.summary,
      proposed_changes: plan.changes.map((change) => ({
        path: change.path,
        action: "update_or_create",
      })),
      rationale: plan.rationale,
      files_changed: plan.filesChanged,
    };

    await writeMemory({
      kind: "agent.self_improve.run",
      title: `Self improve dry run: ${goal}`,
      body: JSON.stringify(
        {
          goal,
          repo: fullRepo,
          dry_run: true,
          proposed_changes: dryRunOutput.proposed_changes,
          rationale: dryRunOutput.rationale,
          files_changed: dryRunOutput.files_changed,
        },
        null,
        2,
      ),
      tags: ["agent", "self-improve", "dry-run"],
      source: "agent.self_improve",
    });

    return dryRunOutput;
  }

  const branch = branchFromGoal(goal);
  const pr = await githubCreatePr({
    owner,
    repo,
    base_branch: baseBranch,
    branch,
    title: `FounderOS self-improve: ${goal}`,
    body: `Automated minimal self-improvement run for goal: ${goal}`,
    commit_message: `chore(founderos): self improve - ${goal}`,
    changes: plan.changes,
  });

  const runOutput = {
    ok: true,
    dry_run: false,
    pr_url: pr.pr_url,
    branch: pr.branch,
    commit_sha: pr.commit_sha,
    summary: plan.summary,
    files_changed: plan.filesChanged,
  };

  await writeMemory({
    kind: "agent.self_improve.run",
    title: `Self improve run: ${goal}`,
    body: JSON.stringify(
      {
        goal,
        repo: fullRepo,
        dry_run: false,
        pr_url: runOutput.pr_url,
        branch: runOutput.branch,
        commit_sha: runOutput.commit_sha,
        files_changed: runOutput.files_changed,
      },
      null,
      2,
    ),
    tags: ["agent", "self-improve", "pr"],
    source: "agent.self_improve",
  });

  return runOutput;
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let toolName = "unknown";
  let toolInput: Record<string, unknown> = {};
  let toolOutput: unknown = { ok: false, error: "internal error" };
  let toolStatus: ToolLogStatus = "error";

  try {
    const raw = await request.json();
    if (!isRecord(raw)) {
      throw new FounderosInputError("body must be a JSON object");
    }

    const normalized = normalizeToolCall(raw);
    toolName = normalized.toolName;
    toolInput = normalized.toolInput;
    console.info("[tools.execute] normalized call", {
      tool_name: toolName,
      has_input: normalized.hasInput,
    });

    if (toolName === "health") {
      toolOutput = { ok: true, ts: new Date().toISOString() };
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    if (toolName === "memory.write") {
      const memoryInput = parseMemoryWriteInput(toolInput);
      const writeResult = await writeMemory(memoryInput);
      toolOutput = { ok: true, ...writeResult };
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    if (toolName === "memory.query") {
      const memoryInput = parseMemoryQueryInput(toolInput);
      const items = await queryMemory(memoryInput);
      toolOutput = { ok: true, items };
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    if (toolName === "system.capabilities") {
      toolOutput = systemCapabilities();
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    if (toolName === "github.get_file") {
      toolOutput = await githubGetFile(toolInput);
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    if (toolName === "github.list_tree") {
      toolOutput = await githubListTree(toolInput);
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    if (toolName === "github.create_pr") {
      toolOutput = await githubCreatePr(toolInput);
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    if (toolName === "tools.list") {
      toolOutput = { ok: true, tools: SUPPORTED_TOOLS };
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    if (toolName === "agent.inspect_repo") {
      toolOutput = await inspectRepo(toolInput, true);
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    if (toolName === "agent.self_improve") {
      toolOutput = await runSelfImprove(toolInput);
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    toolOutput = { ok: false, error: "tool not enabled" };
    return NextResponse.json(toolOutput);
  } catch (error) {
    if (error instanceof SyntaxError) {
      toolOutput = { ok: false, error: "invalid JSON body" };
      return NextResponse.json(toolOutput, { status: 400 });
    }

    if (error instanceof FounderosInputError) {
      toolOutput = { ok: false, error: error.message };
      return NextResponse.json(toolOutput, { status: 400 });
    }

    toolOutput = {
      ok: false,
      error: error instanceof Error ? error.message : "internal error",
    };
    return NextResponse.json(toolOutput, { status: 500 });
  } finally {
    await appendToolLog({
      tool_name: toolName,
      input: toolInput,
      output: toolOutput,
      status: toolStatus,
    }).catch(() => {});
  }
}
