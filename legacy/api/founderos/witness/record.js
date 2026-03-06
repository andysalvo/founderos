const { randomUUID, createHash } = require("crypto");

function sendJson(res, statusCode, payload, extraHeaders) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  if (extraHeaders && typeof extraHeaders === "object") {
    for (const [k, v] of Object.entries(extraHeaders)) {
      res.setHeader(k, v);
    }
  }
  return res.end(JSON.stringify(payload));
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBody(body) {
  if (typeof body === "string") {
    try {
      return { ok: true, value: JSON.parse(body) };
    } catch (_err) {
      return { ok: false };
    }
  }
  if (Buffer.isBuffer(body)) {
    try {
      return { ok: true, value: JSON.parse(body.toString("utf8")) };
    } catch (_err) {
      return { ok: false };
    }
  }
  if (body === undefined || body === null) {
    return { ok: true, value: {} };
  }
  if (isPlainObject(body)) {
    return { ok: true, value: body };
  }
  return { ok: false };
}

async function readBodyFromStream(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

module.exports = async (req, res) => {
  console.log("HEADERS:", JSON.stringify(req.headers));

  try {
    if (req.method !== "POST") {
      return sendJson(
        res,
        405,
        { ok: false, error: "method_not_allowed" },
        { Allow: "POST" }
      );
    }

    const key = req.headers && req.headers["x-founderos-key"];
    if (!key || key !== process.env.FOUNDEROS_WRITE_KEY) {
      return sendJson(res, 401, { ok: false, error: "unauthorized" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return sendJson(res, 500, { ok: false, error: "supabase_not_configured" });
    }

    let bodySource = req.body;
    if (bodySource === undefined && req.readable) {
      bodySource = await readBodyFromStream(req);
    }

    const parsed = parseBody(bodySource);
    if (!parsed.ok || !isPlainObject(parsed.value)) {
      return sendJson(res, 400, { ok: false, error: "invalid_json" });
    }

    const event = parsed.value.event;
    if (!isPlainObject(event)) {
      return sendJson(res, 400, { ok: false, error: "event_required" });
    }

    const ts = typeof event.ts === "string" && event.ts ? event.ts : new Date().toISOString();
    const type = typeof event.type === "string" && event.type ? event.type : "commit.unknown";
    const commitId = typeof event.commit_id === "string" && event.commit_id ? event.commit_id : null;
    const artifactId = typeof event.artifact_id === "string" && event.artifact_id ? event.artifact_id : null;
    const actor = typeof event.actor === "string" && event.actor ? event.actor : "system";
    const payload = isPlainObject(event.payload) ? event.payload : {};

    // Hash only the witness content fields so records are tamper-evident and deterministic.
    const hashInput = {
      ts,
      type,
      commit_id: commitId,
      artifact_id: artifactId,
      actor,
      payload,
    };
    const contentHash = createHash("sha256").update(JSON.stringify(hashInput)).digest("hex");

    // Append-only insert into witness_events via Supabase REST; never update/delete.
    const row = {
      id: randomUUID(),
      ts,
      type,
      commit_id: commitId,
      artifact_id: artifactId,
      actor,
      payload,
      content_hash: contentHash,
    };

    let supabaseResponse;
    try {
      supabaseResponse = await fetch(
        `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/witness_events`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
            prefer: "return=representation",
          },
          body: JSON.stringify(row),
        },
      );
    } catch (_err) {
      return sendJson(res, 502, { ok: false, error: "supabase_insert_failed" });
    }

    if (!supabaseResponse.ok) {
      return sendJson(res, 502, { ok: false, error: "supabase_insert_failed" });
    }

    let inserted = row;
    try {
      const data = await supabaseResponse.json();
      if (Array.isArray(data) && data[0] && isPlainObject(data[0])) {
        inserted = data[0];
      }
    } catch (_err) {
      // Keep fallback row if response body is empty or not JSON.
    }

    return sendJson(res, 200, {
      ok: true,
      witness: {
        id: inserted.id || row.id,
        type: inserted.type || row.type,
        commit_id: inserted.commit_id === undefined ? row.commit_id : inserted.commit_id,
        artifact_id: inserted.artifact_id === undefined ? row.artifact_id : inserted.artifact_id,
        ts: inserted.ts || row.ts,
      },
    });
  } catch (_err) {
    return sendJson(res, 500, { ok: false, error: "internal_error" });
  }
};
