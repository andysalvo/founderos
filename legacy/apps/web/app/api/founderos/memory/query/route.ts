import { NextResponse } from "next/server";

import {
  FounderosInputError,
  isAuthorizedRequest,
  parseMemoryQueryInput,
  queryMemory,
} from "@/lib/founderos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const input = parseMemoryQueryInput({
      kind: url.searchParams.get("kind") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const items = await queryMemory(input);
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    if (error instanceof FounderosInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
