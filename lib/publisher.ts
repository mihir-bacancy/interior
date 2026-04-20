import "server-only";

import { and, eq, lte } from "drizzle-orm";

import { db, captions, posts, videos } from "@/lib/db";
import { createPost, uploadRemoteVideo } from "@/lib/outstand";

export type PublishResult = {
  postId: number;
  outstandPostId?: string;
  status: "posted" | "failed" | "skipped";
  error?: string;
};

/** Publish every post whose scheduled_at has passed. Returns per-post results. */
export async function publishDuePosts(): Promise<PublishResult[]> {
  const now = new Date();

  const duePosts = await db
    .select({
      postId: posts.id,
      videoId: posts.videoId,
      captionId: posts.captionId,
      outstandAccountId: posts.outstandAccountId,
      status: posts.status,
      cloudinaryUrl: videos.cloudinaryUrl,
      title: videos.title,
      captionText: captions.text,
    })
    .from(posts)
    .innerJoin(videos, eq(posts.videoId, videos.id))
    .leftJoin(captions, eq(posts.captionId, captions.id))
    .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, now)));

  const results: PublishResult[] = [];

  for (const row of duePosts) {
    if (!row.captionText || !row.captionText.trim()) {
      await markFailed(row.postId, "no caption attached");
      results.push({ postId: row.postId, status: "failed", error: "no caption" });
      continue;
    }
    if (!row.cloudinaryUrl) {
      await markFailed(row.postId, "no cloudinary url on video");
      results.push({ postId: row.postId, status: "failed", error: "no cloudinary url" });
      continue;
    }

    await db
      .update(posts)
      .set({ status: "publishing", errorMessage: null })
      .where(eq(posts.id, row.postId));

    try {
      const media = await uploadRemoteVideo({
        sourceUrl: row.cloudinaryUrl,
        filenameBase: `interior-${row.postId}`,
      });
      const result = await createPost({
        accounts: [row.outstandAccountId],
        caption: row.captionText,
        mediaUrl: media.url,
        filename: media.filename,
      });

      await db
        .update(posts)
        .set({
          status: "posted",
          outstandPostId: result.postId,
          outstandMediaId: media.mediaId,
          postedAt: new Date(),
        })
        .where(eq(posts.id, row.postId));

      await db
        .update(videos)
        .set({ usedForPost: 1 })
        .where(eq(videos.id, row.videoId));

      results.push({ postId: row.postId, outstandPostId: result.postId, status: "posted" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await markFailed(row.postId, message);
      results.push({ postId: row.postId, status: "failed", error: message });
    }
  }

  return results;
}

async function markFailed(postId: number, message: string) {
  await db
    .update(posts)
    .set({ status: "failed", errorMessage: message.slice(0, 500) })
    .where(eq(posts.id, postId));
}
