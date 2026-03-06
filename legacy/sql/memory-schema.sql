CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS memory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text,
  body text NOT NULL,
  tags text[] DEFAULT '{}',
  source text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_items_created_at_idx ON memory_items (created_at);
CREATE INDEX IF NOT EXISTS memory_items_kind_idx ON memory_items (kind);
CREATE INDEX IF NOT EXISTS memory_items_tags_gin_idx ON memory_items USING gin (tags);

CREATE TABLE IF NOT EXISTS tool_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name text NOT NULL,
  input jsonb NOT NULL,
  output jsonb,
  status text NOT NULL,
  created_at timestamptz DEFAULT now()
);
