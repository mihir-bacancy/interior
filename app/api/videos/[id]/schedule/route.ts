import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, captions, posts, videos } from "@/lib/db";
import { generateCaption } from "@/lib/captions";
import { requireAuth } from "@/lib/session";

const scheduleBody = z.object({
  scheduled_at: z.string().min(1), // ISO string
  outstand_account_id: z.string().optional(),
  caption_id: z.number().int().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireAuth(); } catch (e) { return e as Response; }

  const { id } = await params;
  const videoId = Number(id);
  if (!Number.isFinite(videoId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const parsed = scheduleBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const video = await db.query.videos.findFirst({
    where: (v, { eq }) => eq(v.id, videoId),
  });
  if (!video) return NextResponse.json({ error: "video not found" }, { status: 404 });

  // Resolve caption: explicit id > latest > generate new
  let captionId = body.caption_id;
  if (!captionId) {
    const latest = await db
      .select({ id: captions.id })
      .from(captions)
      .where(eq(captions.videoId, videoId))
      .orderBy(desc(captions.id))
      .limit(1);
    if (latest.length > 0) {
      captionId = latest[0].id;
    } else {
      const generated = await generateCaption({
        keyword: video.keyword,
        title: video.title,
      });
      const [row] = await db
        .insert(captions)
        .values({ videoId, text: generated.text, model: generated.model })
        .returning();
      captionId = row.id;
    }
  }

  // Resolve account: body > config > env
  let accountId = body.outstand_account_id?.trim();
  if (!accountId) {
    const cfg = await db.query.config.findFirst({
      where: (c, { eq }) => eq(c.key, "default_outstand_account_id"),
    });
    accountId = cfg?.value ?? undefined;
  }
  if (!accountId) accountId = (process.env.OUTSTAND_IG_ACCOUNT_ID || "").trim();
  if (!accountId) {
    return NextResponse.json(
      { error: "no Instagram account configured" },
      { status: 400 }
    );
  }

  const scheduledAt = new Date(body.scheduled_at);
  if (isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "bad scheduled_at" }, { status: 400 });
  }

  const [post] = await db
    .insert(posts)
    .values({
      videoId,
      captionId,
      outstandAccountId: accountId,
      scheduledAt,
      status: "scheduled",
    })
    .returning();

  return NextResponse.json({ post });
}
