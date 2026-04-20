import { NextRequest, NextResponse } from "next/server";

import { publishDuePosts } from "@/lib/publisher";

/**
 * Called by cron-job.org every few minutes.
 * Auth: must send header `x-cron-secret: <CRON_SECRET>`.
 *
 * cron-job.org setup:
 *   URL:     https://<your-vercel-domain>/api/cron/post-due
 *   Method:  POST
 *   Headers: x-cron-secret: <value of CRON_SECRET env var>
 *   Schedule: every 5 minutes (or whatever granularity you want)
 */
export async function POST(req: NextRequest) {
  const expected = (process.env.CRON_SECRET || "").trim();
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const received = req.headers.get("x-cron-secret")?.trim() || "";
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
