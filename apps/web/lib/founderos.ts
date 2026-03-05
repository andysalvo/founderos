import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const AUTH_HEADER_NAME = "x-founderos-key";

export class FounderosInputError extends Error {}

export type ToolLogStatus = "ok" | "error";

export type MemoryWriteInput = {
  kind: string;
  title?: string;
  body: string;
  tags?: string[];
  source?: string;
};

export type MemoryQueryInput = {
  kind?: string;
  q?: string;
  limit: number;
};

type MemoryInsertResult = {
  id: string;
  created_at: string;
};

type MemoryItem = {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  tags: string[] | null;
  source: string | null;
  created_at: string;
};

let supabaseAdmin: SupabaseClient | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }
  return supabaseAdmin;
}

export function authHeaderName(): string {
  return AUTH_HEADER_NAME;
}

export function isAuthorizedRequest(request: Request): boolean {
  const expected = process.env.FOUNDEROS_WRITE_KEY;
  const provided = request.headers.get(AUTH_HEADER_NAME);
  return Boolean(expected && provided && expected === provided);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseMemoryWriteInput(raw: unknown): MemoryWriteInput {
  if (!isRecord(raw)) {
    throw new FounderosInputError("body must be a JSON object");
  }

  const kind = typeof raw.kind === "string" ? raw.kind.trim() : "";
  if (!kind) {
    throw new FounderosInputError("kind is required");
  }

  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!body) {
    throw new FounderosInputError("body is required");
  }

  let title: string | undefined;
  if (raw.title !== undefined && raw.title !== null) {
    if (typeof raw.title !== "string") {
      throw new FounderosInputError("title must be a string");
    }
    const value = raw.title.trim();
    if (value) {
      title = value;
    }
  }

  let source: string | undefined;
  if (raw.source !== undefined && raw.source !== null) {
    if (typeof raw.source !== "string") {
      throw new FounderosInputError("source must be a string");
    }
    const value = raw.source.trim();
    if (value) {
      source = value;
    }
  }

  let tags: string[] | undefined;
  if (raw.tags !== undefined && raw.tags !== null) {
    if (!Array.isArray(raw.tags) || raw.tags.some((tag) => typeof tag !== "string")) {
      throw new FounderosInputError("tags must be an array of strings");
    }
    tags = raw.tags.map((tag) => tag.trim()).filter(Boolean);
  }

  return { kind, title, body, tags, source };
}

export function parseMemoryQueryInput(raw: unknown): MemoryQueryInput {
  if (!isRecord(raw)) {
    throw new FounderosInputError("query input must be a JSON object");
  }

  const kindValue = raw.kind;
  if (
    kindValue !== undefined &&
    kindValue !== null &&
    typeof kindValue !== "string"
  ) {
    throw new FounderosInputError("kind must be a string");
  }
  const kind = typeof kindValue === "string" ? kindValue.trim() : undefined;

  const qValue = raw.q;
  if (qValue !== undefined && qValue !== null && typeof qValue !== "string") {
    throw new FounderosInputError("q must be a string");
  }
  const q = typeof qValue === "string" ? qValue.trim() : undefined;

  const limitValue = raw.limit;
  let limit = 20;
  if (limitValue !== undefined && limitValue !== null && limitValue !== "") {
    const parsed =
      typeof limitValue === "number"
        ? limitValue
        : Number.parseInt(String(limitValue), 10);
    if (!Number.isFinite(parsed)) {
      throw new FounderosInputError("limit must be a number");
    }
    limit = Math.trunc(parsed);
  }
  limit = Math.min(100, Math.max(1, limit));

  return {
    kind: kind || undefined,
    q: q || undefined,
    limit,
  };
}

export async function writeMemory(input: MemoryWriteInput): Promise<MemoryInsertResult> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("memory_items")
    .insert({
      kind: input.kind,
      title: input.title ?? null,
      body: input.body,
      tags: input.tags ?? [],
      source: input.source ?? null,
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "failed to write memory item");
  }

  return data;
}

export async function queryMemory(input: MemoryQueryInput): Promise<MemoryItem[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("memory_items")
    .select("id, kind, title, body, tags, source, created_at")
    .order("created_at", { ascending: false })
    .limit(input.limit);

  if (input.kind) {
    query = query.eq("kind", input.kind);
  }

  if (input.q) {
    const safeQuery = input.q.replaceAll(",", "\\,");
    query = query.or(`title.ilike.*${safeQuery}*,body.ilike.*${safeQuery}*`);
  }

  const { data, error } = await query;
  if (error || !data) {
    throw new Error(error?.message ?? "failed to query memory items");
  }

  return data;
}

export async function appendToolLog(params: {
  tool_name: string;
  input: Record<string, unknown>;
  output: unknown;
  status: ToolLogStatus;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("tool_logs").insert({
    tool_name: params.tool_name,
    input: params.input,
    output: params.output,
    status: params.status,
  });

  if (error) {
    throw new Error(error.message);
  }
}
