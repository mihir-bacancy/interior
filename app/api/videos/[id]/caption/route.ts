import { NextRequest, NextResponse } from "next/server";

import { db, captions, videos } from "@/lib/db";
import { generateCaption } from "@/lib/captions";
import { requireAuth } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAuth(); } catch (e) { return e as Response; }

  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isFinite(videoId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const video = await db.query.videos.findFirst({
    where: (v, { eq }) => eq(v.id, videoId),
  });
  if (!video) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { text, model } = await generateCaption({
    keyword: video.keyword,
    title: video.title,
  });

  const [row] = await db
    .insert(captions)
    .values({ videoId: video.id, text, model })
    .returning();

  return NextResponse.json({ caption: row });
}
