const { execFileSync } = require("child_process");

let cachedRuntimeContext = null;

function readGitCommitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch (_err) {
    return null;
  }
}

function getRuntimeContext() {
  if (cachedRuntimeContext) {
    return cachedRuntimeContext;
  }

  const commitSha =
    process.env.FOUNDEROS_RUNTIME_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    readGitCommitSha();

  const source = process.env.FOUNDEROS_RUNTIME_COMMIT_SHA
    ? "FOUNDEROS_RUNTIME_COMMIT_SHA"
    : process.env.VERCEL_GIT_COMMIT_SHA
      ? "VERCEL_GIT_COMMIT_SHA"
      : process.env.GIT_COMMIT_SHA
        ? "GIT_COMMIT_SHA"
        : commitSha
          ? "git"
          : "unknown";

  cachedRuntimeContext = {
    commit_sha: commitSha || null,
    commit_source: source,
  };

  return cachedRuntimeContext;
}

module.exports = {
  getRuntimeContext,
};
