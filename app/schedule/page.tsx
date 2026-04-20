import { desc, eq } from "drizzle-orm";

import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db, captions, posts, videos } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUSES = ["scheduled", "publishing", "posted", "failed"] as const;

export default async function SchedulePage() {
  const rows = await db
    .select({
      id: posts.id,
      scheduledAt: posts.scheduledAt,
      status: posts.status,
      errorMessage: posts.errorMessage,
      outstandPostId: posts.outstandPostId,
      postedAt: posts.postedAt,
      accountId: posts.outstandAccountId,
      videoId: posts.videoId,
      videoTitle: videos.title,
      videoThumb: videos.cloudinaryUrl,
      captionText: captions.text,
    })
    .from(posts)
    .innerJoin(videos, eq(posts.videoId, videos.id))
    .leftJoin(captions, eq(posts.captionId, captions.id))
    .orderBy(desc(posts.scheduledAt))
    .limit(200);

  const buckets: Record<(typeof STATUSES)[number], typeof rows> = {
    scheduled: [],
    publishing: [],
    posted: [],
    failed: [],
  };
  for (const r of rows) {
    const s = (r.status as (typeof STATUSES)[number]) || "scheduled";
    (buckets[s] ??= []).push(r);
  }

  return (
    <>
      <Nav />
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-6 text-2xl font-semibold">Schedule</h1>

        <div className="space-y-8">
          {STATUSES.map((s) => (
            <section key={s}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {s} · {buckets[s].length}
              </h2>
              {buckets[s].length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing here.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {buckets[s].map((p) => (
                    <Card key={p.id}>
                      <CardContent className="flex gap-4 p-4">
                        <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                          <video
                            src={p.videoThumb}
                            muted
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <a href={`/videos/${p.videoId}`} className="block truncate font-medium hover:underline">
                            {p.videoTitle || `video #${p.videoId}`}
                          </a>
                          <div className="text-xs text-muted-foreground">
                            @ {formatDate(p.scheduledAt)} · account {p.accountId}
                          </div>
                          {p.captionText && (
                            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                              {p.captionText}
                            </div>
                          )}
                          {p.errorMessage && (
                            <div className="mt-1 text-xs text-destructive">{p.errorMessage}</div>
                          )}
                          {p.outstandPostId && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              outstand: {p.outstandPostId}
                            </div>
                          )}
                        </div>
                        <span className={cn("h-fit rounded-md px-2 py-0.5 text-xs", statusPill(s))}>
                          {s}
                        </span>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

function statusPill(s: string) {
  switch (s) {
    case "posted": return "bg-green-100 text-green-800";
    case "publishing": return "bg-blue-100 text-blue-800";
    case "failed": return "bg-red-100 text-red-800";
    default: return "bg-secondary text-secondary-foreground";
  }
}
