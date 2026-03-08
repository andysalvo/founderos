const { randomUUID } = require("crypto");
const {
  buildWitnessEvent,
  getSupabaseConfig,
  insertRow,
  patchRows,
  selectRows,
} = require("./supabase");
const { hashJson, isPlainObject } = require("./founderos-v1");

const DECISION_ACTIONS = new Set(["approve", "reject"]);
const CANDIDATE_STATUSES = new Set([
  "proposed",
  "approved",
  "rejected",
  "shadowed",
  "submitted_paper",
  "filled_paper",
  "closed_paper",
  "staged_live",
  "submitted_live",
  "filled_live",
  "closed_live",
  "error",
]);
const LIVE_AUTHORITY_STAGES = new Set([
  "disabled",
  "paper_only",
  "live_staging",
  "canary_live",
  "autonomous_live",
]);

function requireTradingConfig() {
  const config = getSupabaseConfig();
  if (!config) {
    const error = new Error("Supabase is not configured");
    error.code = "trading_not_configured";
    throw error;
  }

  return config;
}

function normalizeIdentifier(value, maxLength = 120) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    return "";
  }

  return trimmed;
}

function normalizeStringArray(value, maxLength = 120) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => typeof item === "string")
    .map((item) => normalizeIdentifier(item, maxLength))
    .filter(Boolean);
}

function parsePositiveLimit(value, fallback = 20) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

function getLiveAuthorityStage() {
  const stage = normalizeIdentifier(process.env.FOUNDEROS_LIVE_AUTHORITY_STAGE || "disabled", 40);
  return LIVE_AUTHORITY_STAGES.has(stage) ? stage : "disabled";
}

function buildConnectorHealth(provider, role, mode, configured) {
  return {
    connector_id: `${provider}_${role}_${mode}`,
    provider,
    role,
    mode,
    credential_owner: "aps",
    status: configured ? "configured" : "not_configured",
    health_status: configured ? "ready_for_adapter_wiring" : "missing_credentials",
    live_authority_stage: getLiveAuthorityStage(),
    last_checked_at: new Date().toISOString(),
  };
}

function getConnectorHealth() {
  return {
    connectors: [
      buildConnectorHealth(
        "alpaca",
        "broker",
        "paper",
        Boolean(process.env.ALPACA_PAPER_API_KEY && process.env.ALPACA_PAPER_SECRET_KEY)
      ),
      buildConnectorHealth(
        "alpaca",
        "broker",
        "live",
        Boolean(process.env.ALPACA_LIVE_API_KEY && process.env.ALPACA_LIVE_SECRET_KEY)
      ),
      buildConnectorHealth(
        "alpaca",
        "market_data",
        "shared",
        Boolean(
          process.env.ALPACA_MARKET_DATA_API_KEY ||
            (process.env.ALPACA_PAPER_API_KEY && process.env.ALPACA_PAPER_SECRET_KEY)
        )
      ),
    ],
    live_authority_state: {
      stage: getLiveAuthorityStage(),
      enabled: getLiveAuthorityStage() === "canary_live" || getLiveAuthorityStage() === "autonomous_live",
      basis: "env_config",
    },
  };
}

function buildTradingWitnessEvent(type, actor, payload, artifactId) {
  const row = buildWitnessEvent(type, actor, payload, artifactId || null, null);
  row.content_hash = hashJson({
    ts: row.ts,
    type: row.type,
    commit_id: row.commit_id,
    artifact_id: row.artifact_id,
    actor: row.actor,
    payload: row.payload,
  });
  return row;
}

async function listTradeCandidates(filters = {}) {
  const config = requireTradingConfig();
  const query = {};
  const status = normalizeIdentifier(filters.status, 40);
  const asset = normalizeIdentifier(filters.asset, 40);
  const executionMode = normalizeIdentifier(filters.execution_mode, 20);

  if (status) {
    query.status = `eq.${status}`;
  }
  if (asset) {
    query.asset = `eq.${asset}`;
  }
  if (executionMode) {
    query.execution_mode = `eq.${executionMode}`;
  }

  return selectRows(
    config,
    "trade_candidates",
    query,
    "id,created_at,updated_at,asset,timeframe,venue,execution_mode,strategy_name,strategy_version,status,max_risk,payload_json,decision_json",
    "updated_at.desc",
    parsePositiveLimit(filters.limit, 20)
  );
}

async function getTradeCandidate(candidateId) {
  const config = requireTradingConfig();
  const rows = await selectRows(
    config,
    "trade_candidates",
    { id: `eq.${candidateId}` },
    "*",
    undefined,
    1
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const decisions = await selectRows(
    config,
    "approval_decisions",
    { candidate_id: `eq.${candidateId}` },
    "*",
    "created_at.desc",
    20
  );
  const orders = await selectRows(
    config,
    "broker_orders",
    { candidate_id: `eq.${candidateId}` },
    "*",
    "updated_at.desc",
    20
  );

  return {
    candidate: rows[0],
    decisions: decisions || [],
    orders: orders || [],
  };
}

async function listTradeJournal(filters = {}) {
  const config = requireTradingConfig();
  const query = {};
  const asset = normalizeIdentifier(filters.asset, 40);
  const status = normalizeIdentifier(filters.status, 40);
  if (asset) {
    query.asset = `eq.${asset}`;
  }
  if (status) {
    query.status = `eq.${status}`;
  }

  return selectRows(
    config,
    "trade_journal",
    query,
    "*",
    "updated_at.desc",
    parsePositiveLimit(filters.limit, 20)
  );
}

async function getBacktestRun(runId) {
  const config = requireTradingConfig();
  const rows = await selectRows(
    config,
    "evaluation_runs",
    { id: `eq.${runId}` },
    "*",
    undefined,
    1
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows[0];
}

function normalizeDecisionBody(body) {
  const payload = isPlainObject(body) ? body : {};
  const decision = normalizeIdentifier(payload.decision, 20).toLowerCase();
  const decidedBy = normalizeIdentifier(payload.authorized_by || payload.decided_by, 120);
  const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 1000) : "";
  const executionMode = normalizeIdentifier(payload.execution_mode, 20).toLowerCase();

  return {
    decision,
    decided_by: decidedBy,
    note,
    execution_mode: executionMode,
    context_json: isPlainObject(payload.context_json) ? payload.context_json : {},
  };
}

async function decideTradeCandidate(candidateId, rawBody) {
  const config = requireTradingConfig();
  const normalized = normalizeDecisionBody(rawBody);
  if (!DECISION_ACTIONS.has(normalized.decision)) {
    const error = new Error("decision_invalid");
    error.code = "decision_invalid";
    throw error;
  }
  if (!normalized.decided_by) {
    const error = new Error("authorized_by_required");
    error.code = "authorized_by_required";
    throw error;
  }

  const existing = await selectRows(
    config,
    "trade_candidates",
    { id: `eq.${candidateId}` },
    "*",
    undefined,
    1
  );
  if (!Array.isArray(existing) || existing.length === 0) {
    return null;
  }

  const candidate = existing[0];
  const nextStatus = normalized.decision === "approve" ? "approved" : "rejected";
  if (!CANDIDATE_STATUSES.has(nextStatus)) {
    const error = new Error("candidate_status_invalid");
    error.code = "candidate_status_invalid";
    throw error;
  }

  const now = new Date().toISOString();
  const decisionId = randomUUID();
  const updatedRows = await patchRows(
    config,
    "trade_candidates",
    { id: `eq.${candidateId}` },
    {
      status: nextStatus,
      updated_at: now,
      decision_json: {
        decision_id: decisionId,
        decision: normalized.decision,
        decided_by: normalized.decided_by,
        note: normalized.note || null,
        decided_at: now,
        context_json: normalized.context_json,
      },
    },
    "*"
  );

  const decisionRow = await insertRow(config, "approval_decisions", {
    id: decisionId,
    candidate_id: candidateId,
    decision: normalized.decision,
    decided_by: normalized.decided_by,
    note: normalized.note || null,
    context_json: normalized.context_json,
    created_at: now,
  });

  await insertRow(
    config,
    "witness_events",
    buildTradingWitnessEvent(
      normalized.decision === "approve"
        ? "trading.candidate_approved"
        : "trading.candidate_rejected",
      normalized.decided_by,
      {
        candidate_id: candidateId,
        previous_status: candidate.status || null,
        next_status: nextStatus,
        execution_mode:
          normalized.execution_mode || candidate.execution_mode || candidate.payload_json?.execution_mode || null,
        strategy_name: candidate.strategy_name || candidate.payload_json?.strategy_name || null,
      },
      candidateId
    )
  );

  return {
    candidate: Array.isArray(updatedRows) ? updatedRows[0] || candidate : candidate,
    decision: decisionRow,
    live_authority_state: getConnectorHealth().live_authority_state,
  };
}

function normalizeTradingScope(scope) {
  const input = isPlainObject(scope) ? scope : {};
  return {
    project_slug: normalizeIdentifier(input.project_slug, 80),
    task_kind: normalizeIdentifier(input.task_kind, 80),
    anchor_paths: normalizeStringArray(input.anchor_paths, 240),
    provider: normalizeIdentifier(input.provider, 80),
    execution_mode: normalizeIdentifier(input.execution_mode, 20),
    strategy_name: normalizeIdentifier(input.strategy_name, 120),
    asset: normalizeIdentifier(input.asset, 40),
    timeframe: normalizeIdentifier(input.timeframe, 40),
  };
}

module.exports = {
  decideTradeCandidate,
  getBacktestRun,
  getConnectorHealth,
  getLiveAuthorityStage,
  getTradeCandidate,
  listTradeCandidates,
  listTradeJournal,
  normalizeTradingScope,
};
