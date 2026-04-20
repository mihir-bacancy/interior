"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Account = {
  outstandAccountId: string;
  username: string | null;
  displayName: string | null;
};

export function VideoActions({
  videoId,
  latestCaption,
  accounts,
  defaultAccountId,
}: {
  videoId: number;
  latestCaption: string | null;
  accounts: Account[];
  defaultAccountId: string | null;
}) {
  const router = useRouter();
  const [caption, setCaption] = useState<string | null>(latestCaption);
  const [generating, setGenerating] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountId, setAccountId] = useState<string>(defaultAccountId || accounts[0]?.outstandAccountId || "");
  const [when, setWhen] = useState<string>(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    // datetime-local expects "YYYY-MM-DDTHH:mm"
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  async function generate() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/videos/${videoId}/caption`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setGenerating(false);
    if (!res.ok) {
      setError(body.error || "caption generation failed");
      return;
    }
    setCaption(body.caption?.text || null);
    router.refresh();
  }

  async function schedule() {
    setScheduling(true);
    setError(null);
    const scheduledAt = new Date(when).toISOString();
    const res = await fetch(`/api/videos/${videoId}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduled_at: scheduledAt,
        outstand_account_id: accountId || undefined,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setScheduling(false);
    if (!res.ok) {
      setError(body.error || "scheduling failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Caption</span>
          <Button size="sm" variant="outline" onClick={generate} disabled={generating}>
            {generating ? "Generating…" : caption ? "Regenerate" : "Generate"}
          </Button>
        </div>
        {caption ? (
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-secondary/30 p-3 text-sm">{caption}</pre>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No caption yet — click Generate.
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Schedule post</div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_3fr]">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {accounts.length === 0 && <option value="">No accounts</option>}
            {accounts.map((a) => (
              <option key={a.outstandAccountId} value={a.outstandAccountId}>
                @{a.username || a.displayName || a.outstandAccountId}
              </option>
            ))}
          </select>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <Button onClick={schedule} disabled={scheduling || !caption || !accountId}>
          {scheduling ? "Scheduling…" : "Schedule"}
        </Button>
        {!caption && <p className="text-xs text-muted-foreground">Generate a caption first.</p>}
        {!accountId && (
          <p className="text-xs text-muted-foreground">
            No account set. Go to <a className="underline" href="/accounts">Accounts</a> to connect.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
