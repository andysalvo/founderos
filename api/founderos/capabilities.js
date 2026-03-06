module.exports = (req, res) => {
  const key = req.headers['x-founderos-key'];
  if (key !== process.env.FOUNDEROS_WRITE_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.status(200).json({
    system: 'founderos-core',
    version: '0.1.0',
    endpoints: [
      { operationId: 'health', method: 'GET', path: '/api/founderos/health', status: 'live' },
      { operationId: 'capabilities', method: 'GET', path: '/api/founderos/capabilities', status: 'live' },
      { operationId: 'precommitPlan', method: 'POST', path: '/api/founderos/precommit/plan', status: 'planned' },
      { operationId: 'materializeWriteSet', method: 'POST', path: '/api/founderos/precommit/materialize-write-set', status: 'planned' },
      { operationId: 'composeCommitRequest', method: 'POST', path: '/api/founderos/precommit/compose-commit-request', status: 'planned' },
      { operationId: 'commitChallenge', method: 'POST', path: '/api/founderos/commit/challenge', status: 'planned' },
      { operationId: 'commitAuthorize', method: 'POST', path: '/api/founderos/commit/authorize', status: 'planned' },
      { operationId: 'commitExecute', method: 'POST', path: '/api/founderos/commit/execute', status: 'planned' },
      { operationId: 'readWitness', method: 'GET', path: '/api/founderos/witness/events', status: 'planned' },
      { operationId: 'getArtifact', method: 'GET', path: '/api/founderos/artifacts/{id}', status: 'planned' }
    ]
  });
};
