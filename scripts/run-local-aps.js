#!/usr/bin/env node
const http = require("http");
const { URL } = require("url");

const healthHandler = require("../api/founderos/health");
const capabilitiesHandler = require("../api/founderos/capabilities");
const capabilitiesCheckHandler = require("../api/founderos/capabilities/check");
const precommitPlanHandler = require("../api/founderos/precommit/plan");
const repoFileHandler = require("../api/founderos/repo/file");
const repoTreeHandler = require("../api/founderos/repo/tree");
const freezeWriteSetHandler = require("../api/founderos/commit/freeze-write-set");
const commitExecuteHandler = require("../api/founderos/commit/execute");
const commitAutoExecuteHandler = require("../api/founderos/commit/auto-execute");
const orchestrateSubmitHandler = require("../api/founderos/orchestrate/submit");
const orchestrateClaimHandler = require("../api/founderos/orchestrate/claim");
const orchestrateJobStatusHandler = require("../api/founderos/orchestrate/jobs/[job_id]");
const orchestrateJobHeartbeatHandler = require("../api/founderos/orchestrate/jobs/[job_id]/heartbeat");
const orchestrateJobCompleteHandler = require("../api/founderos/orchestrate/jobs/[job_id]/complete");
const orchestrateJobFailHandler = require("../api/founderos/orchestrate/jobs/[job_id]/fail");

const PORT = Number(process.env.PORT || process.env.FOUNDEROS_PORT || 8787);
const HOST = process.env.HOST || process.env.FOUNDEROS_HOST || "127.0.0.1";

const routes = new Map([
  ["GET /api/founderos/health", healthHandler],
  ["GET /api/founderos/capabilities", capabilitiesHandler],
  ["POST /api/founderos/capabilities/check", capabilitiesCheckHandler],
  ["POST /api/founderos/precommit/plan", precommitPlanHandler],
  ["POST /api/founderos/repo/file", repoFileHandler],
  ["POST /api/founderos/repo/tree", repoTreeHandler],
  ["POST /api/founderos/commit/freeze-write-set", freezeWriteSetHandler],
  ["POST /api/founderos/commit/execute", commitExecuteHandler],
  ["POST /api/founderos/commit/auto-execute", commitAutoExecuteHandler],
  ["POST /api/founderos/orchestrate/submit", orchestrateSubmitHandler],
  ["POST /api/founderos/orchestrate/claim", orchestrateClaimHandler],
]);

const dynamicRoutes = [
  {
    method: "GET",
    pattern: /^\/api\/founderos\/orchestrate\/jobs\/([^/]+)$/,
    handler: orchestrateJobStatusHandler,
  },
  {
    method: "POST",
    pattern: /^\/api\/founderos\/orchestrate\/jobs\/([^/]+)\/heartbeat$/,
    handler: orchestrateJobHeartbeatHandler,
  },
  {
    method: "POST",
    pattern: /^\/api\/founderos\/orchestrate\/jobs\/([^/]+)\/complete$/,
    handler: orchestrateJobCompleteHandler,
  },
  {
    method: "POST",
    pattern: /^\/api\/founderos\/orchestrate\/jobs\/([^/]+)\/fail$/,
    handler: orchestrateJobFailHandler,
  },
];

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
    let handler = routes.get(routeKey);

    if (!handler) {
      for (const dynamicRoute of dynamicRoutes) {
        const match = req.method === dynamicRoute.method ? url.pathname.match(dynamicRoute.pattern) : null;
        if (match) {
          handler = dynamicRoute.handler;
          req.query = { ...(req.query || {}), job_id: match[1] };
          break;
        }
      }
    }

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
