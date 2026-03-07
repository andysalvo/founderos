import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v4";

import { isAuthorizedRequest, type MemoryWriteInput } from "@/lib/founderos";

export const dynamic = "force-dynamic";

type InspectInput = {
  repo?: string;
  base_branch?: string;
  max_files?: number;
  mode?: "summary" | "self_improvement_readiness";
};

type ImproveInput = {
  goal: string;
  repo?: string;
  base_branch?: string;
  inspect_first?: boolean;
  dry_run?: boolean;
};

type MemoryQueryToolInput = {
  kind?: string;
  q?: string;
  limit?: number;
};

function jsonRpcError(status: number, code: number, message: string): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    },
    { status },
  );
}

function toText(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return "unserializable response";
  }
}

function toMcpToolResult(data: unknown, fallbackTitle: string) {
  const structuredContent =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : { value: data };

  const isError =
    typeof structuredContent.ok === "boolean" && structuredContent.ok === false;

  return {
    content: [
      {
        type: "text" as const,
        text: `${fallbackTitle}\n${toText(data)}`,
      },
    ],
    structuredContent,
    isError,
  };
}

function baseHeaders(request: Request): HeadersInit {
  return {
    "content-type": "application/json",
    "x-founderos-key": request.headers.get("x-founderos-key") ?? "",
  };
}

async function postJson(
  request: Request,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: baseHeaders(request),
    body: JSON.stringify(body),
    cache: "no-store",
  });

  return response
    .json()
    .catch(() => ({ ok: false, error: `upstream ${response.status}` }));
}

async function getJson(
  request: Request,
  path: string,
  query: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-founderos-key": request.headers.get("x-founderos-key") ?? "",
    },
    cache: "no-store",
  });

  return response
    .json()
    .catch(() => ({ ok: false, error: `upstream ${response.status}` }));
}

function buildServer(request: Request): McpServer {
  const server = new McpServer(
    { name: "founderos-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "founderos.inspect",
    {
      title: "FounderOS Inspect",
      description: "Inspect FounderOS repository status through canonical wrapper endpoint.",
      inputSchema: {
        repo: z.string().optional(),
        base_branch: z.string().optional(),
        max_files: z.number().int().min(1).max(2000).optional(),
        mode: z.enum(["summary", "self_improvement_readiness"]).optional(),
      },
    },
    async (args: InspectInput) => {
      const result = await postJson(request, "/founderos/agent/inspect", args);
      return toMcpToolResult(result, "FounderOS inspect result");
    },
  );

  server.registerTool(
    "founderos.improve",
    {
      title: "FounderOS Improve",
      description: "Run self-improvement through canonical wrapper endpoint.",
      inputSchema: {
        goal: z.string(),
        repo: z.string().optional(),
        base_branch: z.string().optional(),
        inspect_first: z.boolean().optional(),
        dry_run: z.boolean().optional(),
      },
    },
    async (args: ImproveInput) => {
      const result = await postJson(request, "/founderos/agent/improve", args);
      return toMcpToolResult(result, "FounderOS improve result");
    },
  );

  server.registerTool(
    "founderos.tools_list",
    {
      title: "FounderOS Tools List",
      description: "List currently enabled FounderOS internal tools.",
    },
    async () => {
      const result = await postJson(request, "/api/founderos/tools/execute", {
        toolName: "tools.list",
      });
      return toMcpToolResult(result, "FounderOS tools list");
    },
  );

  server.registerTool(
    "founderos.system_capabilities",
    {
      title: "FounderOS System Capabilities",
      description: "Discover configured integrations and enabled tool surface without exposing secret values.",
    },
    async () => {
      const result = await postJson(request, "/founderos/system/capabilities", {});
      return toMcpToolResult(result, "FounderOS system capabilities");
    },
  );

  server.registerTool(
    "founderos.memory_query",
    {
      title: "FounderOS Memory Query",
      description: "Query memory items from Supabase memory store.",
      inputSchema: {
        kind: z.string().optional(),
        q: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args: MemoryQueryToolInput) => {
      const result = await getJson(request, "/api/founderos/memory/query", args);
      return toMcpToolResult(result, "FounderOS memory query result");
    },
  );

  server.registerTool(
    "founderos.memory_write",
    {
      title: "FounderOS Memory Write",
      description: "Write one memory item into Supabase memory store.",
      inputSchema: {
        kind: z.string(),
        title: z.string().optional(),
        body: z.string(),
        tags: z.array(z.string()).optional(),
        source: z.string().optional(),
      },
    },
    async (args: MemoryWriteInput) => {
      const result = await postJson(request, "/api/founderos/memory/write", args);
      return toMcpToolResult(result, "FounderOS memory write result");
    },
  );

  return server;
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return jsonRpcError(401, -32001, "unauthorized");
  }

  const server = buildServer(request);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal error";
    return jsonRpcError(500, -32603, message);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

export async function GET() {
  return jsonRpcError(405, -32000, "Method not allowed.");
}

export async function DELETE() {
  return jsonRpcError(405, -32000, "Method not allowed.");
}
