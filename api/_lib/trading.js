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

const SHADOW_SCAN_DEFAULTS = {
  provider: "alpaca",
  venue: "alpaca_crypto_paper",
  execution_mode: "paper",
  strategy_name: "btc_usd_breakout_v1",
  strategy_version: "v1",
  signal_version: "btc_usd_breakout_v1.signal.v1",
  asset: "BTC/USD",
  timeframe: "5m",
  family: "single_asset_breakout",
  fixed_notional_usd: 100,
  max_risk_usd: 2,
  breakout_lookback_bars: 20,
  stop_buffer_pct: 0.0025,
  time_stop_bars: 12,
};

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

function normalizePositiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function roundTo(value, decimals) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeIsoTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ts = new Date(value);
    return Number.isNaN(ts.getTime()) ? "" : ts.toISOString();
  }

  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const ts = new Date(trimmed);
  return Number.isNaN(ts.getTime()) ? "" : ts.toISOString();
}

function normalizeUuid(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
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

function normalizeCandle(raw) {
  const input = isPlainObject(raw) ? raw : {};
  const t = normalizeIsoTimestamp(input.t ?? input.timestamp ?? input.time ?? input.as_of);
  const o = normalizePositiveNumber(input.o ?? input.open);
  const h = normalizePositiveNumber(input.h ?? input.high);
  const l = normalizePositiveNumber(input.l ?? input.low);
  const c = normalizePositiveNumber(input.c ?? input.close);
  const v = normalizePositiveNumber(input.v ?? input.volume) || 0;

  if (!t || o === null || h === null || l === null || c === null) {
    return null;
  }
  if (h < o || h < c || l > o || l > c || l > h) {
    return null;
  }

  return { t, o, h, l, c, v };
}

function sortCandles(candles) {
  return [...candles].sort((left, right) => Date.parse(left.t) - Date.parse(right.t));
}

function normalizeShadowScanBody(body) {
  const payload = isPlainObject(body) ? body : {};
  const candles = Array.isArray(payload.candles)
    ? sortCandles(payload.candles.map(normalizeCandle).filter(Boolean))
    : [];

  return {
    requested_by: normalizeIdentifier(payload.requested_by, 120) || "aps-shadow-scan",
    provider:
      normalizeIdentifier(payload.provider, 40).toLowerCase() || SHADOW_SCAN_DEFAULTS.provider,
    venue: normalizeIdentifier(payload.venue, 80) || SHADOW_SCAN_DEFAULTS.venue,
    source: normalizeIdentifier(payload.source, 80) || "aps_shadow_scan",
    execution_mode:
      normalizeIdentifier(payload.execution_mode, 20).toLowerCase() ||
      SHADOW_SCAN_DEFAULTS.execution_mode,
    strategy_name:
      normalizeIdentifier(payload.strategy_name, 120) || SHADOW_SCAN_DEFAULTS.strategy_name,
    asset: normalizeIdentifier(payload.asset, 40) || SHADOW_SCAN_DEFAULTS.asset,
    timeframe: normalizeIdentifier(payload.timeframe, 40) || SHADOW_SCAN_DEFAULTS.timeframe,
    as_of: normalizeIsoTimestamp(payload.as_of) || (candles.length ? candles[candles.length - 1].t : ""),
    source_job_id: normalizeUuid(payload.source_job_id),
    candles,
  };
}

function validateShadowScanRequest(input) {
  if (!Array.isArray(input.candles) || input.candles.length === 0) {
    const error = new Error("shadow_scan_candles_required");
    error.code = "shadow_scan_candles_required";
    throw error;
  }
  if (input.provider !== SHADOW_SCAN_DEFAULTS.provider) {
    const error = new Error("shadow_scan_provider_invalid");
    error.code = "shadow_scan_provider_invalid";
    throw error;
  }
  if (input.execution_mode !== SHADOW_SCAN_DEFAULTS.execution_mode) {
    const error = new Error("shadow_scan_paper_only");
    error.code = "shadow_scan_paper_only";
    throw error;
  }
  if (input.strategy_name !== SHADOW_SCAN_DEFAULTS.strategy_name) {
    const error = new Error("shadow_scan_strategy_invalid");
    error.code = "shadow_scan_strategy_invalid";
    throw error;
  }
  if (input.asset !== SHADOW_SCAN_DEFAULTS.asset) {
    const error = new Error("shadow_scan_asset_invalid");
    error.code = "shadow_scan_asset_invalid";
    throw error;
  }
  if (input.timeframe !== SHADOW_SCAN_DEFAULTS.timeframe) {
    const error = new Error("shadow_scan_timeframe_invalid");
    error.code = "shadow_scan_timeframe_invalid";
    throw error;
  }
}

function evaluateBtcUsdBreakoutV1(candles) {
  const bars = sortCandles(candles);
  const breakoutLookback = SHADOW_SCAN_DEFAULTS.breakout_lookback_bars;
  const neededBars = breakoutLookback + 1;
  if (bars.length < neededBars) {
    return {
      scan_status: "no_trade",
      reason_code: "insufficient_bars",
      decision: "no_trade",
      strategy_version: SHADOW_SCAN_DEFAULTS.strategy_version,
      signal_version: SHADOW_SCAN_DEFAULTS.signal_version,
      thesis: "No trade. The scan needs more bars before the deterministic breakout rule is valid.",
      entry_reason: `Need at least ${neededBars} bars for the breakout lookback.`,
      invalidation: "No position is open.",
      direction: "flat",
      entry_price: null,
      position_size: null,
      max_risk: null,
      stop_rule: "No stop because no trade is active.",
      exit_rule: "No exit because no trade is active.",
      compact_strategy_metadata: {
        breakout_lookback_bars: breakoutLookback,
        bars_received: bars.length,
        fixed_notional_usd: SHADOW_SCAN_DEFAULTS.fixed_notional_usd,
        max_risk_usd: SHADOW_SCAN_DEFAULTS.max_risk_usd,
      },
      summary: "No trade. More 5m bars are required before the breakout scan is valid.",
    };
  }

  const current = bars[bars.length - 1];
  const previous = bars.slice(-neededBars, -1);
  const priorBreakoutLevel = Math.max(...previous.map((bar) => bar.h));
  const recentLow = Math.min(...previous.slice(-5).map((bar) => bar.l));
  const breakoutDistance = current.c - priorBreakoutLevel;
  const breakoutDistancePct = priorBreakoutLevel > 0 ? breakoutDistance / priorBreakoutLevel : 0;
  const stopPrice = Math.min(recentLow, priorBreakoutLevel * (1 - SHADOW_SCAN_DEFAULTS.stop_buffer_pct));
  const riskPerUnit = current.c - stopPrice;

  if (!(current.c > priorBreakoutLevel) || !(riskPerUnit > 0)) {
    return {
      scan_status: "no_trade",
      reason_code: "breakout_not_confirmed",
      decision: "no_trade",
      strategy_version: SHADOW_SCAN_DEFAULTS.strategy_version,
      signal_version: SHADOW_SCAN_DEFAULTS.signal_version,
      thesis: "No trade. BTC/USD did not close above the prior 20-bar high on the 5m chart.",
      entry_reason: `Last close ${roundTo(current.c, 2)} did not clear breakout level ${roundTo(
        priorBreakoutLevel,
        2
      )}.`,
      invalidation: "No position is open.",
      direction: "flat",
      entry_price: null,
      position_size: null,
      max_risk: null,
      stop_rule: "No stop because no trade is active.",
      exit_rule: "No exit because no trade is active.",
      compact_strategy_metadata: {
        breakout_lookback_bars: breakoutLookback,
        breakout_level: roundTo(priorBreakoutLevel, 2),
        last_close: roundTo(current.c, 2),
        breakout_distance_pct: roundTo(breakoutDistancePct * 100, 3),
        recent_low_5: roundTo(recentLow, 2),
        fixed_notional_usd: SHADOW_SCAN_DEFAULTS.fixed_notional_usd,
        max_risk_usd: SHADOW_SCAN_DEFAULTS.max_risk_usd,
      },
      summary: "No trade. The latest 5m close did not confirm the breakout rule.",
    };
  }

  const notionalQty = SHADOW_SCAN_DEFAULTS.fixed_notional_usd / current.c;
  const riskQty = SHADOW_SCAN_DEFAULTS.max_risk_usd / riskPerUnit;
  const positionSize = Math.min(notionalQty, riskQty);
  const maxRisk = positionSize * riskPerUnit;
  const targetPrice = current.c + riskPerUnit * 2;

  return {
    scan_status: "candidate_created",
    reason_code: "breakout_confirmed",
    decision: "candidate",
    strategy_version: SHADOW_SCAN_DEFAULTS.strategy_version,
    signal_version: SHADOW_SCAN_DEFAULTS.signal_version,
    thesis:
      "BTC/USD closed above the prior 20-bar high on 5m, so the paper system proposes one simple breakout continuation trade.",
    entry_reason: `Last 5m close ${roundTo(current.c, 2)} broke above prior 20-bar breakout level ${roundTo(
      priorBreakoutLevel,
      2
    )}.`,
    invalidation: `If BTC/USD closes back below ${roundTo(
      priorBreakoutLevel,
      2
    )} on the 5m timeframe, the breakout is invalid.`,
    direction: "long",
    entry_price: roundTo(current.c, 2),
    position_size: roundTo(positionSize, 6),
    max_risk: roundTo(maxRisk, 2),
    stop_rule: `Paper stop at ${roundTo(stopPrice, 2)} or on a 5m close back below ${roundTo(
      priorBreakoutLevel,
      2
    )}, whichever comes first.`,
    exit_rule: `Take profit near ${roundTo(targetPrice, 2)} or exit after ${
      SHADOW_SCAN_DEFAULTS.time_stop_bars
    } bars if momentum stalls.`,
    compact_strategy_metadata: {
      breakout_lookback_bars: breakoutLookback,
      breakout_level: roundTo(priorBreakoutLevel, 2),
      last_close: roundTo(current.c, 2),
      breakout_distance_pct: roundTo(breakoutDistancePct * 100, 3),
      recent_low_5: roundTo(recentLow, 2),
      stop_price: roundTo(stopPrice, 2),
      target_price: roundTo(targetPrice, 2),
      fixed_notional_usd: SHADOW_SCAN_DEFAULTS.fixed_notional_usd,
      max_risk_usd: SHADOW_SCAN_DEFAULTS.max_risk_usd,
      time_stop_bars: SHADOW_SCAN_DEFAULTS.time_stop_bars,
    },
    summary: "Candidate created. The deterministic BTC/USD 5m breakout rule fired.",
  };
}

function buildCandidateSummary(row) {
  const payload = isPlainObject(row && row.payload_json) ? row.payload_json : {};
  const decision = isPlainObject(row && row.decision_json) ? row.decision_json : {};

  return {
    candidate_id: row.id,
    id: row.id,
    status: row.status || "proposed",
    venue: row.venue || null,
    execution_mode: row.execution_mode || null,
    asset: row.asset || null,
    timeframe: row.timeframe || null,
    strategy_name: row.strategy_name || null,
    strategy_version: row.strategy_version || null,
    signal_version: payload.signal_version || null,
    thesis: row.thesis || null,
    entry_reason: row.entry_reason || null,
    invalidation: row.invalidation || null,
    direction: row.direction || null,
    entry_price: row.entry_price ?? null,
    position_size: row.position_size ?? null,
    max_risk: row.max_risk ?? null,
    stop_rule: row.stop_rule || null,
    exit_rule: row.exit_rule || null,
    compact_strategy_metadata: isPlainObject(payload.compact_strategy_metadata)
      ? payload.compact_strategy_metadata
      : {},
    decision: typeof decision.decision === "string" ? decision.decision : null,
    decided_by: typeof decision.decided_by === "string" ? decision.decided_by : null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function buildDecisionRecord(row) {
  return {
    id: row.id,
    candidate_id: row.candidate_id,
    decision: row.decision,
    decided_by: row.decided_by,
    note: row.note ?? null,
    context_json: isPlainObject(row.context_json) ? row.context_json : {},
    created_at: row.created_at,
  };
}

function buildBrokerOrderRecord(row) {
  return {
    id: row.id,
    candidate_id: row.candidate_id ?? null,
    provider_order_id: row.provider_order_id ?? null,
    client_order_id: row.client_order_id ?? null,
    asset: row.asset,
    order_type: row.order_type,
    side: row.side,
    time_in_force: row.time_in_force ?? null,
    status: row.status,
    submitted_at: row.submitted_at ?? null,
    updated_at: row.updated_at,
    provider_payload_json: isPlainObject(row.provider_payload_json) ? row.provider_payload_json : {},
  };
}

function buildJournalEntry(row) {
  return {
    id: row.id,
    candidate_id: row.candidate_id ?? null,
    asset: row.asset,
    timeframe: row.timeframe,
    venue: row.venue,
    execution_mode: row.execution_mode,
    strategy_name: row.strategy_name,
    signal_version: row.signal_version ?? null,
    status: row.status,
    outcome: row.outcome ?? null,
    updated_at: row.updated_at,
  };
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

  const rows = await selectRows(config, "trade_candidates", query, "*", "updated_at.desc", parsePositiveLimit(filters.limit, 20));
  return (rows || []).map(buildCandidateSummary);
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
    candidate: buildCandidateSummary(rows[0]),
    decisions: (decisions || []).map(buildDecisionRecord),
    orders: (orders || []).map(buildBrokerOrderRecord),
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

  const rows = await selectRows(
    config,
    "trade_journal",
    query,
    "*",
    "updated_at.desc",
    parsePositiveLimit(filters.limit, 20)
  );
  return (rows || []).map(buildJournalEntry);
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
          normalized.execution_mode ||
          candidate.execution_mode ||
          candidate.payload_json?.execution_mode ||
          null,
        strategy_name: candidate.strategy_name || candidate.payload_json?.strategy_name || null,
      },
      candidateId
    )
  );

  return {
    candidate: buildCandidateSummary(Array.isArray(updatedRows) ? updatedRows[0] || candidate : candidate),
    decision: buildDecisionRecord(decisionRow),
    live_authority_state: getConnectorHealth().live_authority_state,
  };
}

async function ensureStrategyDefinition(config) {
  const existing = await selectRows(
    config,
    "strategy_definitions",
    {
      strategy_name: `eq.${SHADOW_SCAN_DEFAULTS.strategy_name}`,
      version: `eq.${SHADOW_SCAN_DEFAULTS.strategy_version}`,
    },
    "*",
    "created_at.asc",
    1
  );

  if (Array.isArray(existing) && existing[0]) {
    return existing[0];
  }

  return insertRow(config, "strategy_definitions", {
    id: randomUUID(),
    strategy_name: SHADOW_SCAN_DEFAULTS.strategy_name,
    version: SHADOW_SCAN_DEFAULTS.strategy_version,
    family: SHADOW_SCAN_DEFAULTS.family,
    asset_universe_json: [SHADOW_SCAN_DEFAULTS.asset],
    timeframe: SHADOW_SCAN_DEFAULTS.timeframe,
    parameters_json: {
      breakout_lookback_bars: SHADOW_SCAN_DEFAULTS.breakout_lookback_bars,
      stop_buffer_pct: SHADOW_SCAN_DEFAULTS.stop_buffer_pct,
      fixed_notional_usd: SHADOW_SCAN_DEFAULTS.fixed_notional_usd,
      max_risk_usd: SHADOW_SCAN_DEFAULTS.max_risk_usd,
      time_stop_bars: SHADOW_SCAN_DEFAULTS.time_stop_bars,
    },
    explainability_summary:
      "Long-only BTC/USD 5m breakout. Buy only when the last close breaks above the prior 20-bar high. Fixed notional and capped paper risk.",
    status: "paper_candidate",
    created_at: new Date().toISOString(),
  });
}

async function createShadowScanCandidate(rawBody) {
  const config = requireTradingConfig();
  const normalized = normalizeShadowScanBody(rawBody);
  validateShadowScanRequest(normalized);

  const strategy = await ensureStrategyDefinition(config);
  const evaluation = evaluateBtcUsdBreakoutV1(normalized.candles);
  const now = new Date().toISOString();

  const snapshot = await insertRow(config, "market_snapshots", {
    id: randomUUID(),
    asset: normalized.asset,
    timeframe: normalized.timeframe,
    source: normalized.source,
    as_of: normalized.as_of || now,
    ohlcv_json: normalized.candles,
    features_json: {
      scan_status: evaluation.scan_status,
      compact_strategy_metadata: evaluation.compact_strategy_metadata,
    },
  });

  const signalRun = await insertRow(config, "signal_runs", {
    id: randomUUID(),
    strategy_id: strategy.id,
    snapshot_id: snapshot.id,
    mode: "shadow_scan",
    decision: evaluation.decision,
    confidence_note: "deterministic_rule",
    rationale_json: {
      summary: evaluation.summary,
      thesis: evaluation.thesis,
      entry_reason: evaluation.entry_reason,
      invalidation: evaluation.invalidation,
      signal_version: evaluation.signal_version,
      compact_strategy_metadata: evaluation.compact_strategy_metadata,
    },
    created_at: now,
  });

  await insertRow(
    config,
    "witness_events",
    buildTradingWitnessEvent(
      "trading.shadow_scan_evaluated",
      normalized.requested_by,
      {
        strategy_name: normalized.strategy_name,
        strategy_version: evaluation.strategy_version,
        signal_version: evaluation.signal_version,
        asset: normalized.asset,
        timeframe: normalized.timeframe,
        execution_mode: normalized.execution_mode,
        provider: normalized.provider,
        scan_status: evaluation.scan_status,
        market_snapshot_id: snapshot.id,
        signal_run_id: signalRun.id,
      },
      signalRun.id
    )
  );

  if (evaluation.scan_status !== "candidate_created") {
    return {
      ok: true,
      scan_status: "no_trade",
      strategy_name: normalized.strategy_name,
      strategy_version: evaluation.strategy_version,
      signal_version: evaluation.signal_version,
      summary: evaluation.summary,
      market_snapshot_id: snapshot.id,
      signal_run_id: signalRun.id,
      compact_strategy_metadata: evaluation.compact_strategy_metadata,
      candidate: null,
      live_authority_state: getConnectorHealth().live_authority_state,
    };
  }

  const candidateRow = await insertRow(config, "trade_candidates", {
    id: randomUUID(),
    source_job_id: normalized.source_job_id,
    strategy_id: strategy.id,
    signal_run_id: signalRun.id,
    strategy_name: normalized.strategy_name,
    strategy_version: evaluation.strategy_version,
    venue: normalized.venue,
    execution_mode: normalized.execution_mode,
    asset: normalized.asset,
    timeframe: normalized.timeframe,
    direction: evaluation.direction,
    entry_price: evaluation.entry_price,
    position_size: evaluation.position_size,
    max_risk: evaluation.max_risk,
    thesis: evaluation.thesis,
    entry_reason: evaluation.entry_reason,
    invalidation: evaluation.invalidation,
    stop_rule: evaluation.stop_rule,
    exit_rule: evaluation.exit_rule,
    status: "proposed",
    payload_json: {
      signal_version: evaluation.signal_version,
      compact_strategy_metadata: evaluation.compact_strategy_metadata,
      market_snapshot_id: snapshot.id,
      signal_run_id: signalRun.id,
      provider: normalized.provider,
      source: normalized.source,
      execution_mode: normalized.execution_mode,
      generated_at: now,
    },
    decision_json: {},
    created_at: now,
    updated_at: now,
  });

  await insertRow(
    config,
    "witness_events",
    buildTradingWitnessEvent(
      "trading.candidate_created",
      normalized.requested_by,
      {
        candidate_id: candidateRow.id,
        strategy_name: normalized.strategy_name,
        strategy_version: evaluation.strategy_version,
        signal_version: evaluation.signal_version,
        asset: normalized.asset,
        timeframe: normalized.timeframe,
        execution_mode: normalized.execution_mode,
        entry_price: evaluation.entry_price,
        max_risk: evaluation.max_risk,
      },
      candidateRow.id
    )
  );

  return {
    ok: true,
    scan_status: "candidate_created",
    strategy_name: normalized.strategy_name,
    strategy_version: evaluation.strategy_version,
    signal_version: evaluation.signal_version,
    summary: evaluation.summary,
    market_snapshot_id: snapshot.id,
    signal_run_id: signalRun.id,
    compact_strategy_metadata: evaluation.compact_strategy_metadata,
    candidate: buildCandidateSummary(candidateRow),
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
  SHADOW_SCAN_DEFAULTS,
  buildCandidateSummary,
  createShadowScanCandidate,
  decideTradeCandidate,
  evaluateBtcUsdBreakoutV1,
  getBacktestRun,
  getConnectorHealth,
  getLiveAuthorityStage,
  getTradeCandidate,
  listTradeCandidates,
  listTradeJournal,
  normalizeShadowScanBody,
  normalizeTradingScope,
};
