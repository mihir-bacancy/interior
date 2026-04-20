import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { VideoActions } from "./actions";
import { Nav } from "@/components/nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db, accounts, captions, config, posts, videos } from "@/lib/db";
import { formatDate, formatDuration } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function VideoDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isFinite(id)) notFound();

  const video = await db.query.videos.findFirst({ where: eq(videos.id, id) });
  if (!video) notFound();

  const [captionRows, postRows, accountRows, defaultCfg] = await Promise.all([
    db.select().from(captions).where(eq(captions.videoId, id)).orderBy(desc(captions.id)),
    db.select().from(posts).where(eq(posts.videoId, id)).orderBy(desc(posts.scheduledAt)),
    db.select().from(accounts).orderBy(accounts.username),
    db.query.config.findFirst({ where: eq(config.key, "default_outstand_account_id") }),
  ]);

  return (
    <>
      <Nav />
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-4 text-sm text-muted-foreground">
          <a href="/videos" className="hover:text-foreground">
            ← All videos
          </a>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_2fr]">
          <div>
            <div className="overflow-hidden rounded-lg border border-border bg-black">
              <video
                src={video.cloudinaryUrl}
                className="h-auto w-full"
                controls
                playsInline
                preload="metadata"
              />
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Keyword: </span>
                {video.keyword}
              </div>
              <div>
                <span className="text-muted-foreground">Pin: </span>
                {video.pinId}
              </div>
              <div>
                <span className="text-muted-foreground">Size: </span>
                {video.width}×{video.height} · {formatDuration(video.durationMs)}
              </div>
              <div>
                <span className="text-muted-foreground">Downloaded: </span>
                {formatDate(video.downloadedAt)}
              </div>
              <div className="break-all">
                <a
                  href={video.cloudinaryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {video.cloudinaryUrl}
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{video.title || `Pin ${video.pinId}`}</CardTitle>
              </CardHeader>
              <CardContent>
                <VideoActions
                  videoId={video.id}
                  latestCaption={captionRows[0]?.text || null}
                  accounts={accountRows}
                  defaultAccountId={defaultCfg?.value ?? null}
                />
              </CardContent>
            </Card>

            {postRows.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Scheduled posts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {postRows.map((p) => (
                    <div key={p.id} className="flex justify-between border-b border-border pb-2 last:border-none">
                      <div>
                        <div className="font-medium capitalize">{p.status}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(p.scheduledAt)}</div>
                        {p.errorMessage && (
                          <div className="text-xs text-destructive">{p.errorMessage}</div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.outstandPostId || "—"}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {captionRows.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Caption history</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {captionRows.map((c) => (
                    <div key={c.id} className="border-b border-border pb-3 last:border-none">
                      <pre className="whitespace-pre-wrap font-sans">{c.text}</pre>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {c.model} · {formatDate(c.generatedAt)}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
