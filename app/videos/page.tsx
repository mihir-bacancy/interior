import Link from "next/link";
import { desc, sql } from "drizzle-orm";

import { Nav } from "@/components/nav";
import { Card, CardContent } from "@/components/ui/card";
import { db, captions, videos } from "@/lib/db";
import { formatDate, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function VideosPage() {
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

  return (
    <>
      <Nav />
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Videos</h1>
            <p className="text-sm text-muted-foreground">
              {rows.length} in library · {rows.filter((r) => r.usedForPost === 0).length} unused
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((v) => (
            <Link key={v.id} href={`/videos/${v.id}`} className="group">
              <Card className="overflow-hidden transition hover:shadow-md">
                <div className="relative aspect-[9/16] bg-muted">
                  <video
                    src={v.cloudinaryUrl}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  {v.usedForPost === 1 && (
                    <span className="absolute right-2 top-2 rounded-md bg-background/90 px-2 py-0.5 text-xs shadow">
                      Posted
                    </span>
                  )}
                </div>
                <CardContent className="space-y-1 p-3">
                  <div className="line-clamp-2 text-sm font-medium">
                    {v.title || `pin ${v.pinId}`}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{v.keyword}</span>
                    <span>
                      {v.width}×{v.height} · {formatDuration(v.durationMs)}
                    </span>
                  </div>
                  {v.caption ? (
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {v.caption}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs italic text-muted-foreground">
                      no caption yet
                    </div>
                  )}
                  <div className="pt-1 text-xs text-muted-foreground">
                    {formatDate(v.downloadedAt)}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {rows.length === 0 && (
          <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
            No videos yet. Run the Python downloader in <code>downloader/</code> to ingest.
          </div>
        )}
      </div>
    </>
  );
}
