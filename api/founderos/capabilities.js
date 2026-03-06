const CAPABILITIES = {
  system: "founderos-core",
  version: "0.1.0",
  endpoints: [
    {
      operationId: "health",
      method: "GET",
      path: "/api/founderos/health",
      status: "live",
    },
    {
      operationId: "capabilities",
      method: "GET",
      path: "/api/founderos/capabilities",
      status: "live",
    },
    {
      operationId: "precommitPlan",
      method: "POST",
      path: "/api/founderos/precommit/plan",
      status: "planned",
    },
    {
      operationId: "materializeWriteSet",
      method: "POST",
      path: "/api/founderos/precommit/materialize-write-set",
      status: "planned",
    },
    {
      operationId: "composeCommitRequest",
      method: "POST",
      path: "/api/founderos/precommit/compose-commit-request",
      status: "planned",
    },
    {
      operationId: "commitChallenge",
      method: "POST",
      path: "/api/founderos/commit/challenge",
      status: "planned",
    },
    {
      operationId: "commitAuthorize",
      method: "POST",
      path: "/api/founderos/commit/authorize",
      status: "planned",
    },
    {
      operationId: "commitExecute",
      method: "POST",
      path: "/api/founderos/commit/execute",
      status: "planned",
    },
    {
      operationId: "readWitness",
      method: "GET",
      path: "/api/founderos/witness/events",
      status: "planned",
    },
    {
      operationId: "getArtifact",
      method: "GET",
      path: "/api/founderos/artifacts/{id}",
      status: "planned",
    },
  ],
};

module.exports = (req, res) => {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.json({ error: "method_not_allowed" });
  }

  const providedKey = req.headers["x-founderos-key"];
  const expectedKey = process.env.FOUNDEROS_WRITE_KEY;

  if (!providedKey || !expectedKey || providedKey !== expectedKey) {
    res.statusCode = 401;
    return res.json({ error: "unauthorized" });
  }

  res.statusCode = 200;
  return res.json(CAPABILITIES);
};
