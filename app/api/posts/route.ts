import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db, captions, posts, videos } from "@/lib/db";
import { requireAuth } from "@/lib/session";

export async function GET() {
  try { await requireAuth(); } catch (e) { return e as Response; }

  const rows = await db
    .select({
      id: posts.id,
      videoId: posts.videoId,
      outstandAccountId: posts.outstandAccountId,
      scheduledAt: posts.scheduledAt,
      status: posts.status,
      outstandPostId: posts.outstandPostId,
      errorMessage: posts.errorMessage,
      postedAt: posts.postedAt,
      createdAt: posts.createdAt,
      videoTitle: videos.title,
      videoUrl: videos.cloudinaryUrl,
      captionText: captions.text,
    })
    .from(posts)
    .innerJoin(videos, eq(posts.videoId, videos.id))
    .leftJoin(captions, eq(posts.captionId, captions.id))
    .orderBy(desc(posts.scheduledAt))
    .limit(200);

  return NextResponse.json({ posts: rows });
}
