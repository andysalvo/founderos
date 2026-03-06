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
  "github.get_file",
  "github.list_tree",
  "github.create_pr",
  "tools.list",
  "agent.self_improve",
] as const;

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
} {
  const nameFromSnake = raw.tool_name;
  const nameFromCamel = raw.toolName;
  const toolNameRaw =
    typeof nameFromSnake === "string" && nameFromSnake.trim().length > 0
      ? nameFromSnake
      : nameFromCamel;

  if (typeof toolNameRaw !== "string" || toolNameRaw.trim().length === 0) {
    throw new FounderosInputError("tool_name is required");
  }

  const inputRaw =
    raw.input !== undefined
      ? raw.input
      : raw.toolInput !== undefined
        ? raw.toolInput
        : {};

  if (!isRecord(inputRaw)) {
    throw new FounderosInputError("input must be a JSON object");
  }

  return {
    toolName: toolNameRaw.trim(),
    toolInput: inputRaw,
  };
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

async function runSelfImprove(input: Record<string, unknown>) {
  const goal = typeof input.goal === "string" ? input.goal.trim() : "";
  if (!goal) {
    throw new FounderosInputError("goal is required");
  }

  const baseBranch =
    typeof input.base_branch === "string" && input.base_branch.trim().length > 0
      ? input.base_branch.trim()
      : "main";

  const allowedRepos = parseAllowedRepos();
  const chosenRepo =
    typeof input.repo === "string" && input.repo.trim().length > 0
      ? input.repo.trim()
      : allowedRepos[0];
  if (!allowedRepos.map((repo) => repo.toLowerCase()).includes(chosenRepo.toLowerCase())) {
    throw new FounderosInputError(`repo not allowed: ${chosenRepo}`);
  }
  const { owner, repo } = parseOwnerRepoString(chosenRepo);

  await githubListTree({ owner, repo, ref: baseBranch, limit: 1000 });

  const gitignore = await safeReadFile({
    owner,
    repo,
    ref: baseBranch,
    path: ".gitignore",
  });
  const knowledgeDoc = await safeReadFile({
    owner,
    repo,
    ref: baseBranch,
    path: "docs/KNOWLEDGE.md",
  });
  const openapiDoc = await safeReadFile({
    owner,
    repo,
    ref: baseBranch,
    path: "docs/openapi.founderos.yaml",
  });

  const changes: Array<{ path: string; content: string }> = [];
  const filesChanged: string[] = [];

  if (gitignore === null || !lineExists(gitignore, "knowledge/")) {
    changes.push({
      path: ".gitignore",
      content: gitignore === null ? "knowledge/\n" : appendLine(gitignore, "knowledge/"),
    });
    filesChanged.push(".gitignore");
  } else if (knowledgeDoc !== null && !knowledgeDoc.includes("github.create_pr")) {
    changes.push({
      path: "docs/KNOWLEDGE.md",
      content: `${knowledgeDoc.trimEnd()}

Tool surface additions:
- github.get_file
- github.list_tree
- github.create_pr
- tools.list
- agent.self_improve
`,
    });
    filesChanged.push("docs/KNOWLEDGE.md");
  } else if (
    openapiDoc !== null &&
    (!openapiDoc.includes("tools.list") || !openapiDoc.includes("agent.self_improve"))
  ) {
    const marker = "            - github.create_pr";
    if (!openapiDoc.includes(marker)) {
      throw new FounderosInputError("openapi format not recognized for deterministic update");
    }
    const updated = openapiDoc.replace(
      marker,
      `${marker}
            - tools.list
            - agent.self_improve`,
    );
    changes.push({
      path: "docs/openapi.founderos.yaml",
      content: updated,
    });
    filesChanged.push("docs/openapi.founderos.yaml");
  } else {
    changes.push({
      path: "docs/SELF_IMPROVE.md",
      content: `# Self Improve

This file confirms a minimal deterministic self-improvement PR path is available.
`,
    });
    filesChanged.push("docs/SELF_IMPROVE.md");
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
    changes,
  });

  await writeMemory({
    kind: "self_improve.run",
    title: `Self improve: ${goal}`,
    body: JSON.stringify(
      {
        goal,
        repo: `${owner}/${repo}`,
        pr_url: pr.pr_url,
        files_changed: filesChanged,
      },
      null,
      2,
    ),
    tags: ["self-improve", "github", "pr"],
    source: "agent.self_improve",
  });

  return pr;
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

    toolOutput = { ok: false, error: "internal error" };
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
