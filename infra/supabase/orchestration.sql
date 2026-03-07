create extension if not exists pgcrypto;

create table if not exists plan_artifacts (
  id text primary key,
  created_at timestamptz not null default now(),
  repo text,
  scope_json jsonb not null default '{}'::jsonb,
  artifact_json jsonb not null,
  content_hash text not null,
  source_job_id uuid
);

create table if not exists orchestration_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (
    status in (
      'queued',
      'claimed',
      'inspecting',
      'planning',
      'write_set_ready',
      'executing',
      'completed',
      'failed',
      'blocked'
    )
  ),
  requested_by text not null,
  repo text,
  scope_json jsonb not null default '{}'::jsonb,
  user_request text not null,
  constraints_json jsonb not null default '[]'::jsonb,
  initial_artifact_id text,
  claimed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_heartbeat_at timestamptz,
  completed_at timestamptz,
  result_json jsonb not null default '{}'::jsonb
);

create table if not exists orchestration_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references orchestration_jobs(id) on delete cascade,
  ts timestamptz not null default now(),
  type text not null,
  actor text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists plan_artifacts_source_job_idx on plan_artifacts (source_job_id);
create index if not exists orchestration_jobs_status_created_idx on orchestration_jobs (status, created_at asc);
create index if not exists orchestration_jobs_updated_idx on orchestration_jobs (updated_at desc);
create index if not exists orchestration_events_job_ts_idx on orchestration_events (job_id, ts asc);
