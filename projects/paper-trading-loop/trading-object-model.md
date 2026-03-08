# Trading Object Model

Status: proposed v1 trading object model for APS-centered control

## Design rule

Extend the current APS object model.
Do not create a separate trading control plane.

## Core objects

### `strategy_definition`

Defines one strategy version that can be backtested, paper-run, promoted, or suspended.

Minimum fields:

- `strategy_id`
- `strategy_name`
- `version`
- `family`
- `asset_universe`
- `timeframe`
- `parameters_json`
- `explainability_summary`
- `status`
- `created_at`

### `evaluation_run`

Captures one research or validation run over a fixed dataset and parameter set.

Minimum fields:

- `run_id`
- `strategy_id`
- `dataset_id`
- `mode`
- `trial_count`
- `metrics_json`
- `pbo`
- `dsr`
- `serial_correlation_adjusted_sharpe`
- `turnover_assumptions_json`
- `cost_assumptions_json`
- `result_summary`
- `created_at`

### `market_snapshot`

Normalized data frame used by strategy logic.

Minimum fields:

- `snapshot_id`
- `asset`
- `timeframe`
- `source`
- `as_of`
- `ohlcv_json`
- `features_json`

### `signal_run`

One evaluation pass of a strategy over a current or replayed snapshot.

Minimum fields:

- `signal_run_id`
- `strategy_id`
- `snapshot_id`
- `mode`
- `decision`
- `confidence_note`
- `rationale_json`
- `created_at`

### `trade_candidate`

The founder-readable and system-readable decision object that precedes execution.

Minimum fields:

- `candidate_id`
- `strategy_id`
- `signal_run_id`
- `venue`
- `execution_mode`
- `asset`
- `timeframe`
- `direction`
- `entry_price`
- `position_size`
- `max_risk`
- `thesis`
- `entry_reason`
- `invalidation`
- `stop_rule`
- `exit_rule`
- `status`
- `created_at`

### `approval_decision`

One governed decision against a candidate.

Minimum fields:

- `decision_id`
- `candidate_id`
- `decision`
- `decided_by`
- `decision_context`
- `created_at`

### `risk_policy`

The currently active risk envelope for paper or live execution.

Minimum fields:

- `risk_policy_id`
- `mode`
- `max_position_notional`
- `max_daily_loss`
- `allowed_assets`
- `allowed_connectors`
- `kill_switch_enabled`
- `policy_version`
- `created_at`

### `broker_connector`

The APS-owned description of one admitted broker or market-data adapter.

Minimum fields:

- `connector_id`
- `provider`
- `role`
- `mode`
- `credential_owner`
- `status`
- `health_status`
- `last_checked_at`

### `broker_order`

APS-owned canonical order object, regardless of provider representation.

Minimum fields:

- `broker_order_id`
- `candidate_id`
- `connector_id`
- `provider_order_id`
- `client_order_id`
- `asset`
- `type`
- `side`
- `time_in_force`
- `limit_price`
- `stop_price`
- `status`
- `submitted_at`
- `updated_at`
- `provider_payload_json`

### `fill_event`

Append-only order fill or partial-fill event.

Minimum fields:

- `fill_event_id`
- `broker_order_id`
- `event_ts`
- `fill_qty`
- `fill_price`
- `fees_json`
- `provider_payload_json`

### `position_state`

Current or historical position state derived from fills and broker sync.

Minimum fields:

- `position_state_id`
- `asset`
- `execution_mode`
- `qty`
- `avg_entry_price`
- `unrealized_pnl`
- `realized_pnl`
- `status`
- `updated_at`

### `kill_switch_event`

Records an activation, test, or reset of a trading stop mechanism.

Minimum fields:

- `kill_switch_event_id`
- `scope`
- `trigger`
- `state`
- `actor`
- `created_at`

### `live_authority_state`

Stores whether live autonomy is disabled, staged, canary-only, or active under amendment-defined rules.

Minimum fields:

- `live_authority_state_id`
- `stage`
- `enabled`
- `basis`
- `policy_version`
- `last_changed_at`

## Object relationships

- one `strategy_definition` has many `evaluation_run`
- one `market_snapshot` may feed many `signal_run`
- one `signal_run` may produce zero or one `trade_candidate`
- one `trade_candidate` may have many `approval_decision`
- one `trade_candidate` may create one or more `broker_order`
- one `broker_order` may have many `fill_event`
- many `fill_event` roll into one or more `position_state`
- execution is allowed only when `risk_policy`, `broker_connector`, and `live_authority_state` allow it

## Authority rule

- OpenClaw may create research artifacts, evaluation artifacts, and candidate recommendations.
- APS owns connector admission, execution permission, order transmission, and witness logging.
- No worker should hold implicit authority merely because it produced a candidate.
