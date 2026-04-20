import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db, videos } from "@/lib/db";
import { uploadFromUrl } from "@/lib/cloudinary";

const ingestBody = z.object({
  pin_id: z.string().min(1),
  keyword: z.string().min(1),
  title: z.string().nullable().optional(),
  // EITHER a remote URL we can upload from (HLS .m3u8 or direct mp4),
  // OR an already-uploaded Cloudinary public_id + url.
  source_url: z.string().url().optional(),
  cloudinary_url: z.string().url().optional(),
  cloudinary_public_id: z.string().optional(),
  local_path: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  duration_ms: z.number().int().optional(),
});

function checkIngestAuth(req: NextRequest): Response | null {
  const expected = (process.env.INGEST_SECRET || "").trim();
  if (!expected) return new Response("INGEST_SECRET not configured", { status: 500 });
  const received = req.headers.get("x-ingest-secret")?.trim() || "";
  if (received !== expected) return new Response("unauthorized", { status: 401 });
  return null;
}

export async function POST(req: NextRequest) {
  const authError = checkIngestAuth(req);
  if (authError) return authError;

  const json = await req.json().catch(() => null);
  const parsed = ingestBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const body = parsed.data;

  // Idempotency: if pin_id already exists, return it.
  const existing = await db.query.videos.findFirst({
    where: (v, { eq }) => eq(v.pinId, body.pin_id),
  });
  if (existing) {
    return NextResponse.json({ ok: true, video: existing, deduped: true });
  }

  let cloudinaryUrl = body.cloudinary_url;
  let cloudinaryPublicId = body.cloudinary_public_id;

  // If no Cloudinary info yet, upload from source URL.
  if (!cloudinaryUrl || !cloudinaryPublicId) {
    if (!body.source_url) {
      return NextResponse.json(
        { error: "source_url required when no cloudinary_url provided" },
        { status: 400 }
      );
    }
    try {
      const uploaded = await uploadFromUrl(body.source_url, {
        folder: "interior",
        publicId: `${body.keyword.replace(/[^a-z0-9]+/gi, "_")}_${body.pin_id}`,
      });
      cloudinaryUrl = uploaded.url;
      cloudinaryPublicId = uploaded.publicId;
    } catch (err: unknown) {
      return NextResponse.json(
        { error: "cloudinary upload failed", details: String(err instanceof Error ? err.message : err) },
        { status: 502 }
      );
    }
  }

  const [row] = await db
    .insert(videos)
    .values({
      pinId: body.pin_id,
      keyword: body.keyword,
      title: body.title ?? null,
      cloudinaryUrl: cloudinaryUrl!,
      cloudinaryPublicId: cloudinaryPublicId!,
      localPath: body.local_path ?? null,
      sourceUrl: body.source_url ?? null,
      width: body.width,
      height: body.height,
      durationMs: body.duration_ms,
    })
    .onConflictDoNothing({ target: videos.pinId })
    .returning();

  return NextResponse.json({ ok: true, video: row });
}
