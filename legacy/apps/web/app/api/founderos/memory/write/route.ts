import { NextResponse } from "next/server";

import {
  FounderosInputError,
  isAuthorizedRequest,
  parseMemoryWriteInput,
  writeMemory,
} from "@/lib/founderos";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const raw = await request.json();
    const input = parseMemoryWriteInput(raw);
    const result = await writeMemory(input);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }

    if (error instanceof FounderosInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
