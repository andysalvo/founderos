const { createSign } = require("crypto");

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

function encodePathForGitHub(path) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function githubRequest(token, method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = `GitHub API ${response.status}`;
    try {
      const data = await response.json();
      if (data && typeof data.message === "string" && data.message) {
        detail = data.message;
      }
    } catch (_err) {
      // Preserve default detail when response body is not JSON.
    }
    const error = new Error(detail);
    error.code = "github_api_error";
    error.statusCode = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function getInstallationToken(appId, installationId, privateKeyPem) {
  const jwt = createGitHubAppJwt(appId, privateKeyPem);

  const response = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
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
      // Preserve default detail when response body is not JSON.
    }
    const error = new Error(detail);
    error.code = "github_api_error";
    error.statusCode = response.status;
    throw error;
  }

  const data = await response.json();
  return data.token;
}

module.exports = {
  encodePathForGitHub,
  getInstallationToken,
  githubRequest,
};
