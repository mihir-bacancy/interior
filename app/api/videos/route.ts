import { NextResponse } from "next/server";
import { desc, eq, isNull, sql } from "drizzle-orm";

import { db, captions, videos } from "@/lib/db";
import { requireAuth } from "@/lib/session";

export async function GET() {
  try { await requireAuth(); } catch (e) { return e as Response; }

  // Latest caption per video via correlated subquery
  const latestCaptionText = sql<string | null>`(
    SELECT c.text FROM ${captions} c
    WHERE c.video_id = ${videos.id}
    ORDER BY c.id DESC LIMIT 1
  )`;

  const rows = await db
    .select({
      id: videos.id,
      pinId: videos.pinId,
      keyword: videos.keyword,
      title: videos.title,
      cloudinaryUrl: videos.cloudinaryUrl,
      width: videos.width,
      height: videos.height,
      durationMs: videos.durationMs,
      downloadedAt: videos.downloadedAt,
      usedForPost: videos.usedForPost,
      caption: latestCaptionText,
    })
    .from(videos)
    .orderBy(desc(videos.downloadedAt))
    .limit(200);

  return NextResponse.json({ videos: rows });
}
