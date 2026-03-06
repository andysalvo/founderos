const { createSign } = require("crypto");

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

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlEncodeBuffer(buffer) {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

// Same JWT signing logic used in commit/execute.js.
function createGitHubAppJwt(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: String(appId),
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);

  return `${signingInput}.${base64UrlEncodeBuffer(signature)}`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(
      res,
      405,
      { ok: false, error: "method_not_allowed" },
      { Allow: "POST" }
    );
  }

  const providedKey = req.headers && req.headers["x-founderos-key"];
  if (!providedKey || providedKey !== process.env.FOUNDEROS_WRITE_KEY) {
    return sendJson(res, 401, { ok: false, error: "unauthorized" });
  }

  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY || "";
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const diagnostics = {
    ok: true,
    env: {
      github_app_id_present: Boolean(process.env.GITHUB_APP_ID),
      github_installation_id_present: Boolean(process.env.GITHUB_INSTALLATION_ID),
      github_app_private_key_present: rawKey.length > 0,
    },
    key: {
      length: rawKey.length,
      first_50: rawKey.slice(0, 50),
      last_50: rawKey.slice(rawKey.length > 50 ? rawKey.length - 50 : 0),
      starts_with_begin: rawKey.startsWith("-----BEGIN"),
      contains_literal_backslash_n: rawKey.includes("\\n"),
    },
    jwt: {
      success: false,
      error: null,
      preview: null,
    },
    installation_token: {
      success: false,
      error: null,
      preview: null,
    },
  };

  // Required temporary logs for diagnosing env formatting without printing full key.
  console.log("GITHUB_APP_PRIVATE_KEY first50:", diagnostics.key.first_50);
  console.log("GITHUB_APP_PRIVATE_KEY last50:", diagnostics.key.last_50);
  console.log("GITHUB_APP_PRIVATE_KEY length:", diagnostics.key.length);
  console.log("GITHUB_APP_PRIVATE_KEY startsWith BEGIN:", diagnostics.key.starts_with_begin);
  console.log(
    "GITHUB_APP_PRIVATE_KEY contains literal \\n:",
    diagnostics.key.contains_literal_backslash_n
  );

  let jwt;
  try {
    jwt = createGitHubAppJwt(process.env.GITHUB_APP_ID, privateKey);
    diagnostics.jwt.success = true;
    diagnostics.jwt.preview = jwt.slice(0, 24);
  } catch (err) {
    diagnostics.jwt.error = err && err.message ? err.message : "jwt_sign_failed";
    return sendJson(res, 200, diagnostics);
  }

  try {
    const response = await fetch(
      `https://api.github.com/app/installations/${encodeURIComponent(
        process.env.GITHUB_INSTALLATION_ID || ""
      )}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${jwt}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!response.ok) {
      let detail = `GitHub auth ${response.status}`;
      try {
        const data = await response.json();
        if (data && typeof data.message === "string" && data.message) {
          detail = data.message;
        }
      } catch (_err) {
        // Keep default detail when body is not JSON.
      }
      diagnostics.installation_token.error = detail;
      return sendJson(res, 200, diagnostics);
    }

    const tokenData = await response.json();
    diagnostics.installation_token.success = true;
    diagnostics.installation_token.preview =
      typeof tokenData.token === "string" ? tokenData.token.slice(0, 12) : null;
  } catch (err) {
    diagnostics.installation_token.error =
      err && err.message ? err.message : "installation_token_exchange_failed";
  }

  return sendJson(res, 200, diagnostics);
};
