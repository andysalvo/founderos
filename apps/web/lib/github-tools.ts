import { createSign } from "crypto";

import { FounderosInputError, isRecord } from "@/lib/founderos";

class GitHubApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type GitHubRefResponse = {
  object: {
    sha: string;
  };
};

type GitHubCommitResponse = {
  tree: {
    sha: string;
  };
};

type GitHubTreeResponse = {
  truncated: boolean;
  tree: Array<{
    path: string;
    mode: string;
    type: string;
    sha: string;
    size?: number;
  }>;
};

type GitHubContentResponse = {
  sha: string;
  path: string;
  size: number;
  content?: string;
  encoding?: string;
};

type GitHubPutContentResponse = {
  commit: {
    sha: string;
  };
};

type GitHubPullResponse = {
  html_url: string;
};

let cachedInstallationToken: { token: string; expiresAtMs: number } | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new FounderosInputError(`missing environment variable: ${name}`);
  }
  return value;
}

function parseAllowedRepos(): Set<string> {
  const raw = requiredEnv("ALLOWED_REPOS");
  const values = raw
    .split(/[\n,]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (values.length === 0) {
    throw new FounderosInputError("ALLOWED_REPOS is empty");
  }

  return new Set(values);
}

function assertRepoAllowed(owner: string, repo: string) {
  const allowlist = parseAllowedRepos();
  const target = `${owner}/${repo}`.toLowerCase();
  if (!allowlist.has(target)) {
    throw new FounderosInputError(`repo not allowed: ${owner}/${repo}`);
  }
}

function toBase64Url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function normalizePrivateKey(raw: string): string {
  let key = raw.trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  if (key.includes("\\n")) {
    key = key.replace(/\\n/g, "\n");
  }

  if (!key.includes("BEGIN") && /^[A-Za-z0-9+/=\n\r]+$/.test(key)) {
    try {
      const decoded = Buffer.from(key, "base64").toString("utf8");
      if (decoded.includes("BEGIN")) {
        key = decoded;
      }
    } catch {
      // Ignore decoding errors and let signer surface format issues.
    }
  }

  return key;
}

function createGitHubAppJwt(): string {
  const appId = requiredEnv("GITHUB_APP_ID");
  const privateKey = normalizePrivateKey(requiredEnv("GITHUB_APP_PRIVATE_KEY"));

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60,
    exp: now + 9 * 60,
    iss: appId,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey, "base64url");

  return `${unsigned}.${signature}`;
}

async function githubApi<T>(
  path: string,
  init: RequestInit,
  authMode: "app" | "installation" = "installation",
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", "founderos-tools/1.0");

  if (authMode === "app") {
    headers.set("Authorization", `Bearer ${createGitHubAppJwt()}`);
  } else {
    headers.set("Authorization", `Bearer ${await getInstallationToken()}`);
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `GitHub API error (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string };
      if (data.message) {
        message = data.message;
      }
    } catch {
      const text = await response.text();
      if (text) {
        message = text;
      }
    }
    throw new GitHubApiError(message, response.status);
  }

  return (await response.json()) as T;
}

async function getInstallationToken(): Promise<string> {
  if (
    cachedInstallationToken &&
    Date.now() + 60_000 < cachedInstallationToken.expiresAtMs
  ) {
    return cachedInstallationToken.token;
  }

  const installationId = requiredEnv("GITHUB_INSTALLATION_ID");
  const response = await githubApi<{ token: string; expires_at: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    { method: "POST" },
    "app",
  );

  cachedInstallationToken = {
    token: response.token,
    expiresAtMs: Date.parse(response.expires_at),
  };

  return response.token;
}

function parseOwnerRepo(input: Record<string, unknown>): { owner: string; repo: string } {
  const owner = typeof input.owner === "string" ? input.owner.trim() : "";
  const repo = typeof input.repo === "string" ? input.repo.trim() : "";
  if (!owner || !repo) {
    throw new FounderosInputError("owner and repo are required");
  }
  assertRepoAllowed(owner, repo);
  return { owner, repo };
}

function parseRef(value: unknown, defaultValue = "main"): string {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FounderosInputError("ref must be a non-empty string");
  }
  return value.trim();
}

function encodePath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function validateRepoPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new FounderosInputError("file path is required");
  }
  if (trimmed.startsWith("/") || trimmed.includes("..") || trimmed.includes("\\")) {
    throw new FounderosInputError(`invalid file path: ${path}`);
  }
  return trimmed;
}

function isProtectedBranch(branch: string): boolean {
  const protectedBranches = new Set(["main", "master", "production", "prod", "release"]);
  return protectedBranches.has(branch.toLowerCase());
}

async function getBranchHeadSha(
  owner: string,
  repo: string,
  branch: string,
): Promise<string> {
  const encodedRef = branch.split("/").map((part) => encodeURIComponent(part)).join("/");
  const refData = await githubApi<GitHubRefResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodedRef}`,
    { method: "GET" },
  );
  return refData.object.sha;
}

async function getFileShaIfExists(
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const data = await githubApi<GitHubContentResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
      { method: "GET" },
    );
    return data.sha;
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function githubGetFile(raw: unknown) {
  if (!isRecord(raw)) {
    throw new FounderosInputError("input must be a JSON object");
  }

  const { owner, repo } = parseOwnerRepo(raw);
  const pathValue = typeof raw.path === "string" ? raw.path : "";
  const path = validateRepoPath(pathValue);
  const ref = parseRef(raw.ref, "main");

  const data = await githubApi<GitHubContentResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
    { method: "GET" },
  );

  const content =
    data.encoding === "base64" && typeof data.content === "string"
      ? Buffer.from(data.content.replaceAll("\n", ""), "base64").toString("utf8")
      : null;

  return {
    ok: true,
    owner,
    repo,
    path: data.path,
    ref,
    sha: data.sha,
    size: data.size,
    content,
  };
}

export async function githubListTree(raw: unknown) {
  if (!isRecord(raw)) {
    throw new FounderosInputError("input must be a JSON object");
  }

  const { owner, repo } = parseOwnerRepo(raw);
  const ref = parseRef(raw.ref, "main");
  const pathPrefix =
    typeof raw.path_prefix === "string" ? raw.path_prefix.trim() : "";
  const limitRaw = raw.limit;
  const limit =
    limitRaw === undefined || limitRaw === null
      ? 200
      : Math.min(1000, Math.max(1, Math.trunc(Number(limitRaw))));

  if (!Number.isFinite(limit)) {
    throw new FounderosInputError("limit must be a number");
  }

  const commitSha = await getBranchHeadSha(owner, repo, ref);
  const commitData = await githubApi<GitHubCommitResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${encodeURIComponent(commitSha)}`,
    { method: "GET" },
  );

  const treeData = await githubApi<GitHubTreeResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(commitData.tree.sha)}?recursive=1`,
    { method: "GET" },
  );

  const files = treeData.tree
    .filter((item) => item.type === "blob")
    .filter((item) => !pathPrefix || item.path.startsWith(pathPrefix))
    .slice(0, limit)
    .map((item) => ({
      path: item.path,
      sha: item.sha,
      size: item.size ?? 0,
      mode: item.mode,
    }));

  return {
    ok: true,
    owner,
    repo,
    ref,
    path_prefix: pathPrefix || undefined,
    truncated: treeData.truncated || treeData.tree.length > files.length,
    files,
  };
}

export async function githubCreatePr(raw: unknown) {
  if (!isRecord(raw)) {
    throw new FounderosInputError("input must be a JSON object");
  }

  const { owner, repo } = parseOwnerRepo(raw);
  const baseBranch = parseRef(raw.base_branch, "main");
  const branchInput = parseRef(raw.branch, `founderos-ai-${Date.now()}`);
  const branch = branchInput.trim();
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const body = typeof raw.body === "string" ? raw.body : "";
  const commitMessage =
    typeof raw.commit_message === "string" && raw.commit_message.trim()
      ? raw.commit_message.trim()
      : `chore(founderos): ${title || "automated update"}`;

  if (!title) {
    throw new FounderosInputError("title is required");
  }
  if (!branch) {
    throw new FounderosInputError("branch is required");
  }
  if (branch === baseBranch) {
    throw new FounderosInputError("branch must differ from base_branch");
  }
  if (isProtectedBranch(branch)) {
    throw new FounderosInputError("branch name is protected");
  }

  const changesRaw = raw.changes;
  if (!Array.isArray(changesRaw) || changesRaw.length === 0) {
    throw new FounderosInputError("changes must be a non-empty array");
  }

  const changes = changesRaw.map((change, index) => {
    if (!isRecord(change)) {
      throw new FounderosInputError(`changes[${index}] must be an object`);
    }
    const pathValue = typeof change.path === "string" ? change.path : "";
    const contentValue = typeof change.content === "string" ? change.content : null;
    if (contentValue === null) {
      throw new FounderosInputError(`changes[${index}].content must be a string`);
    }
    return {
      path: validateRepoPath(pathValue),
      content: contentValue,
    };
  });

  const baseSha = await getBranchHeadSha(owner, repo, baseBranch);
  try {
    await githubApi(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
      {
        method: "POST",
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: baseSha,
        }),
      },
    );
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 422) {
      throw new FounderosInputError("branch already exists");
    }
    throw error;
  }

  let latestCommitSha = baseSha;
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index];
    const existingSha = await getFileShaIfExists(owner, repo, change.path, branch);

    const putData = await githubApi<GitHubPutContentResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(change.path)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message: `${commitMessage} (${index + 1}/${changes.length})`,
          content: Buffer.from(change.content, "utf8").toString("base64"),
          branch,
          sha: existingSha ?? undefined,
        }),
      },
    );

    latestCommitSha = putData.commit.sha;
  }

  const pullData = await githubApi<GitHubPullResponse>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({
        title,
        head: branch,
        base: baseBranch,
        body,
      }),
    },
  );

  return {
    ok: true,
    pr_url: pullData.html_url,
    branch,
    commit_sha: latestCommitSha,
  };
}
