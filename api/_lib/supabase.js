const { randomUUID } = require("crypto");

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url: url.replace(/\/+$/, ""),
    serviceRoleKey,
  };
}

async function supabaseRequest(config, method, path, body, extraHeaders) {
  const response = await fetch(`${config.url}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  if (response.status !== 204) {
    try {
      data = await response.json();
    } catch (_err) {
      data = null;
    }
  }

  if (!response.ok) {
    const error = new Error(`Supabase REST ${response.status}`);
    error.code = "supabase_request_failed";
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function insertRows(config, table, rows) {
  return supabaseRequest(config, "POST", `/rest/v1/${table}`, rows, {
    prefer: "return=representation",
  });
}

async function insertRow(config, table, row) {
  const inserted = await insertRows(config, table, [row]);
  return Array.isArray(inserted) ? inserted[0] || row : row;
}

async function patchRows(config, table, filters, patch, select) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters || {})) {
    params.set(key, value);
  }
  if (select) {
    params.set("select", select);
  }

  return supabaseRequest(config, "PATCH", `/rest/v1/${table}?${params.toString()}`, patch, {
    prefer: "return=representation",
  });
}

async function selectRows(config, table, filters, select, order, limit) {
  const params = new URLSearchParams();
  params.set("select", select || "*");
  for (const [key, value] of Object.entries(filters || {})) {
    params.set(key, value);
  }
  if (order) {
    params.set("order", order);
  }
  if (limit !== undefined) {
    params.set("limit", String(limit));
  }

  return supabaseRequest(config, "GET", `/rest/v1/${table}?${params.toString()}`);
}

function buildWitnessEvent(type, actor, payload, artifactId, commitId) {
  const ts = new Date().toISOString();
  return {
    id: randomUUID(),
    ts,
    type,
    commit_id: commitId || null,
    artifact_id: artifactId || null,
    actor,
    payload,
  };
}

module.exports = {
  buildWitnessEvent,
  getSupabaseConfig,
  insertRow,
  insertRows,
  patchRows,
  selectRows,
  supabaseRequest,
};
