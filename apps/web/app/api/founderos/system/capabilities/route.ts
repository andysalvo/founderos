import { NextResponse } from "next/server";

import { isAuthorizedRequest } from "@/lib/founderos";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  url.pathname = "/api/founderos/tools/execute";
  url.search = "";

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-founderos-key": request.headers.get("x-founderos-key") ?? "",
    },
    body: JSON.stringify({
      toolName: "system.capabilities",
      toolInput: {},
    }),
    cache: "no-store",
  });

  const result = await response.json().catch(() => ({ ok: false, error: "upstream error" }));
  return NextResponse.json(result, { status: response.status });
}
