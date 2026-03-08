create extension if not exists pgcrypto;

create table if not exists strategy_definitions (
  id uuid primary key default gen_random_uuid(),
  strategy_name text not null,
  version text not null,
  family text not null,
  asset_universe_json jsonb not null default '[]'::jsonb,
  timeframe text not null,
  parameters_json jsonb not null default '{}'::jsonb,
  explainability_summary text not null,
  status text not null default 'research',
  created_at timestamptz not null default now()
);

create table if not exists evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid references strategy_definitions(id) on delete set null,
  dataset_id text not null,
  mode text not null,
  trial_count integer not null default 1,
  metrics_json jsonb not null default '{}'::jsonb,
  pbo double precision,
  dsr double precision,
  serial_correlation_adjusted_sharpe double precision,
  turnover_assumptions_json jsonb not null default '{}'::jsonb,
  cost_assumptions_json jsonb not null default '{}'::jsonb,
  result_summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists market_snapshots (
  id uuid primary key default gen_random_uuid(),
  asset text not null,
  timeframe text not null,
  source text not null,
  as_of timestamptz not null,
  ohlcv_json jsonb not null default '[]'::jsonb,
  features_json jsonb not null default '{}'::jsonb
);

create table if not exists signal_runs (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid references strategy_definitions(id) on delete set null,
  snapshot_id uuid references market_snapshots(id) on delete set null,
  mode text not null,
  decision text not null,
  confidence_note text,
  rationale_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists trade_candidates (
  id uuid primary key default gen_random_uuid(),
  source_job_id uuid references orchestration_jobs(id) on delete set null,
  strategy_id uuid references strategy_definitions(id) on delete set null,
  signal_run_id uuid references signal_runs(id) on delete set null,
  strategy_name text,
  strategy_version text,
  venue text not null,
  execution_mode text not null,
  asset text not null,
  timeframe text not null,
  direction text not null,
  entry_price double precision,
  position_size double precision,
  max_risk double precision,
  thesis text not null,
  entry_reason text not null,
  invalidation text not null,
  stop_rule text not null,
  exit_rule text not null,
  status text not null default 'proposed',
  payload_json jsonb not null default '{}'::jsonb,
  decision_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approval_decisions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references trade_candidates(id) on delete cascade,
  decision text not null,
  decided_by text not null,
  note text,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists risk_policies (
  id uuid primary key default gen_random_uuid(),
  mode text not null,
  max_position_notional double precision,
  max_daily_loss double precision,
  allowed_assets_json jsonb not null default '[]'::jsonb,
  allowed_connectors_json jsonb not null default '[]'::jsonb,
  kill_switch_enabled boolean not null default true,
  policy_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists broker_connectors (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  role text not null,
  mode text not null,
  credential_owner text not null,
  status text not null,
  health_status text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists broker_orders (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references trade_candidates(id) on delete set null,
  connector_id uuid references broker_connectors(id) on delete set null,
  provider_order_id text,
  client_order_id text,
  asset text not null,
  order_type text not null,
  side text not null,
  time_in_force text,
  limit_price double precision,
  stop_price double precision,
  status text not null,
  provider_payload_json jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists fill_events (
  id uuid primary key default gen_random_uuid(),
  broker_order_id uuid not null references broker_orders(id) on delete cascade,
  event_ts timestamptz not null,
  fill_qty double precision,
  fill_price double precision,
  fees_json jsonb not null default '{}'::jsonb,
  provider_payload_json jsonb not null default '{}'::jsonb
);

create table if not exists position_states (
  id uuid primary key default gen_random_uuid(),
  asset text not null,
  execution_mode text not null,
  qty double precision not null default 0,
  avg_entry_price double precision,
  unrealized_pnl double precision,
  realized_pnl double precision,
  status text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists kill_switch_events (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  trigger text not null,
  state text not null,
  actor text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists live_authority_states (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  enabled boolean not null default false,
  basis text not null,
  policy_version text,
  metadata_json jsonb not null default '{}'::jsonb,
  last_changed_at timestamptz not null default now()
);

create table if not exists trade_journal (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references trade_candidates(id) on delete set null,
  broker_order_id uuid references broker_orders(id) on delete set null,
  asset text not null,
  timeframe text not null,
  venue text not null,
  execution_mode text not null,
  strategy_name text not null,
  signal_version text,
  direction text not null,
  entry_price double precision,
  exit_price double precision,
  position_size double precision,
  max_risk double precision,
  thesis text not null,
  entry_reason text not null,
  invalidation text not null,
  stop_rule text not null,
  exit_reason text,
  outcome text,
  pnl_absolute double precision,
  pnl_percent double precision,
  rule_violations_json jsonb not null default '[]'::jsonb,
  review_notes text,
  status text not null,
  opened_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists trade_candidates_status_updated_idx on trade_candidates (status, updated_at desc);
create index if not exists approval_decisions_candidate_created_idx on approval_decisions (candidate_id, created_at desc);
create index if not exists evaluation_runs_strategy_created_idx on evaluation_runs (strategy_id, created_at desc);
create index if not exists broker_orders_candidate_updated_idx on broker_orders (candidate_id, updated_at desc);
create index if not exists trade_journal_asset_updated_idx on trade_journal (asset, updated_at desc);
