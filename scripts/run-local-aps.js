#!/usr/bin/env node
const http = require("http");
const { URL } = require("url");

const healthHandler = require("../api/founderos/health");
const capabilitiesHandler = require("../api/founderos/capabilities");
const capabilitiesCheckHandler = require("../api/founderos/capabilities/check");
const precommitPlanHandler = require("../api/founderos/precommit/plan");
const repoFileHandler = require("../api/founderos/repo/file");
const repoTreeHandler = require("../api/founderos/repo/tree");
const commitExecuteHandler = require("../api/founderos/commit/execute");

const PORT = Number(process.env.PORT || process.env.FOUNDEROS_PORT || 8787);
const HOST = process.env.HOST || process.env.FOUNDEROS_HOST || "127.0.0.1";

const routes = new Map([
  ["GET /api/founderos/health", healthHandler],
  ["GET /api/founderos/capabilities", capabilitiesHandler],
  ["POST /api/founderos/capabilities/check", capabilitiesCheckHandler],
  ["POST /api/founderos/precommit/plan", precommitPlanHandler],
  ["POST /api/founderos/repo/file", repoFileHandler],
  ["POST /api/founderos/repo/tree", repoTreeHandler],
  ["POST /api/founderos/commit/execute", commitExecuteHandler],
]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const routeKey = `${req.method} ${url.pathname}`;
    const handler = routes.get(routeKey);

    if (!handler) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }

    req.body = await readBody(req);
    await handler(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        error: "local_server_error",
        detail: error instanceof Error ? error.message : "Unexpected error",
      })
    );
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Founderos APS listening on http://${HOST}:${PORT}\n`);
});
