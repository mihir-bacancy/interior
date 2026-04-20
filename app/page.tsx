import { desc, eq, sql } from "drizzle-orm";

import { Nav } from "@/components/nav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db, accounts, captions, posts, videos } from "@/lib/db";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [videoStats, scheduledUpcoming, postedRecent, failedRecent, accountCount] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE used_for_post = 0) AS unused,
        COUNT(*) AS total
      FROM videos
    `),
    db
      .select({
        id: posts.id,
        scheduledAt: posts.scheduledAt,
        status: posts.status,
        title: videos.title,
      })
      .from(posts)
      .innerJoin(videos, eq(posts.videoId, videos.id))
      .where(eq(posts.status, "scheduled"))
      .orderBy(posts.scheduledAt)
      .limit(5),
    db
      .select({
        id: posts.id,
        postedAt: posts.postedAt,
        outstandPostId: posts.outstandPostId,
        title: videos.title,
      })
      .from(posts)
      .innerJoin(videos, eq(posts.videoId, videos.id))
      .where(eq(posts.status, "posted"))
      .orderBy(desc(posts.postedAt))
      .limit(5),
    db
      .select({
        id: posts.id,
        scheduledAt: posts.scheduledAt,
        errorMessage: posts.errorMessage,
        title: videos.title,
      })
      .from(posts)
      .innerJoin(videos, eq(posts.videoId, videos.id))
      .where(eq(posts.status, "failed"))
      .orderBy(desc(posts.scheduledAt))
      .limit(5),
    db.select().from(accounts),
  ]);

  const stats = (videoStats.rows?.[0] as { unused: number | string; total: number | string }) || {
    unused: 0,
    total: 0,
  };
  const captionCount = await db.$count(captions);

  return (
    <>
      <Nav />
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Stat label="Videos (total)" value={Number(stats.total)} />
          <Stat label="Unused videos" value={Number(stats.unused)} />
          <Stat label="Captions generated" value={captionCount} />
          <Stat label="Connected accounts" value={accountCount.length} />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Next up</CardTitle>
              <CardDescription>Next 5 scheduled posts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {scheduledUpcoming.length === 0 && (
                <p className="text-muted-foreground">Nothing scheduled.</p>
              )}
              {scheduledUpcoming.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span className="truncate pr-2">{p.title || `video #${p.id}`}</span>
                  <span className="text-muted-foreground">{formatDate(p.scheduledAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recently posted</CardTitle>
              <CardDescription>Last 5 successful posts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {postedRecent.length === 0 && (
                <p className="text-muted-foreground">No posts yet.</p>
              )}
              {postedRecent.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span className="truncate pr-2">{p.title || `video #${p.id}`}</span>
                  <span className="text-muted-foreground">{formatDate(p.postedAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {failedRecent.length > 0 && (
          <Card className="mt-6 border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Failed posts</CardTitle>
              <CardDescription>Last 5 failures — check /schedule to retry</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {failedRecent.map((p) => (
                <div key={p.id}>
                  <div className="font-medium">{p.title || `video #${p.id}`}</div>
                  <div className="text-xs text-muted-foreground">{p.errorMessage}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
