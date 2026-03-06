create extension if not exists pgcrypto;

create table if not exists witness_events (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null,
  type text not null,
  commit_id text,
  artifact_id text,
  actor text not null,
  payload jsonb not null default '{}'::jsonb,
  content_hash text not null
);

create index if not exists witness_events_ts_idx on witness_events (ts desc);
create index if not exists witness_events_type_idx on witness_events (type);
create index if not exists witness_events_artifact_id_idx on witness_events (artifact_id);
