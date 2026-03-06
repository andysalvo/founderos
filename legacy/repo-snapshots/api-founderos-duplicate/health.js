module.exports = (req, res) => {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.json({ error: "method_not_allowed" });
  }

  res.statusCode = 200;
  return res.json({
    status: "ok",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
};
