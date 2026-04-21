import { NextRequest, NextResponse } from "next/server";

import { publishDuePosts } from "@/lib/publisher";

/**
 * Called by cron-job.org every few minutes.
 *
 * Auth (either works):
 *   - Header:  x-cron-secret: <CRON_SECRET>
 *   - Query:   ?secret=<CRON_SECRET>
 *
 * Query-param form is for cron services that can't set custom headers.
 * Trade-off: query strings show up in access logs / cron-job.org history,
 * so rotate CRON_SECRET if you suspect exposure.
 */
export async function POST(req: NextRequest) {
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const received =
    req.headers.get("x-cron-secret")?.trim() ||
    new URL(req.url).searchParams.get("secret")?.trim() ||
    "";
  if (received !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const results = await publishDuePosts();
    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - started,
      count: results.length,
      results,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

// Allow GET for easy manual testing (same auth)
export const GET = POST;
