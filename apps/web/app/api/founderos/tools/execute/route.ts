import { NextResponse } from "next/server";

import {
  FounderosInputError,
  appendToolLog,
  isAuthorizedRequest,
  isRecord,
  parseMemoryQueryInput,
  parseMemoryWriteInput,
  queryMemory,
  writeMemory,
  type ToolLogStatus,
} from "@/lib/founderos";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let toolName = "unknown";
  let toolInput: Record<string, unknown> = {};
  let toolOutput: unknown = { ok: false, error: "internal error" };
  let toolStatus: ToolLogStatus = "error";

  try {
    const raw = await request.json();
    if (!isRecord(raw)) {
      throw new FounderosInputError("body must be a JSON object");
    }

    if (typeof raw.tool_name !== "string" || raw.tool_name.trim().length === 0) {
      throw new FounderosInputError("tool_name is required");
    }
    toolName = raw.tool_name.trim();

    if (raw.input === undefined) {
      toolInput = {};
    } else if (!isRecord(raw.input)) {
      throw new FounderosInputError("input must be a JSON object");
    } else {
      toolInput = raw.input;
    }

    if (toolName === "health") {
      toolOutput = { ok: true, ts: new Date().toISOString() };
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    if (toolName === "memory.write") {
      const memoryInput = parseMemoryWriteInput(toolInput);
      const writeResult = await writeMemory(memoryInput);
      toolOutput = { ok: true, ...writeResult };
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    if (toolName === "memory.query") {
      const memoryInput = parseMemoryQueryInput(toolInput);
      const items = await queryMemory(memoryInput);
      toolOutput = { ok: true, items };
      toolStatus = "ok";
      return NextResponse.json(toolOutput);
    }

    toolOutput = { ok: false, error: "tool not enabled" };
    return NextResponse.json(toolOutput);
  } catch (error) {
    if (error instanceof SyntaxError) {
      toolOutput = { ok: false, error: "invalid JSON body" };
      return NextResponse.json(toolOutput, { status: 400 });
    }

    if (error instanceof FounderosInputError) {
      toolOutput = { ok: false, error: error.message };
      return NextResponse.json(toolOutput, { status: 400 });
    }

    toolOutput = { ok: false, error: "internal error" };
    return NextResponse.json(toolOutput, { status: 500 });
  } finally {
    await appendToolLog({
      tool_name: toolName,
      input: toolInput,
      output: toolOutput,
      status: toolStatus,
    }).catch(() => {});
  }
}
