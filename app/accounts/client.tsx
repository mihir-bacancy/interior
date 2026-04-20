"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Account = {
  outstandAccountId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export function AccountsClient({
  initialAccounts,
  initialDefault,
}: {
  initialAccounts: Account[];
  initialDefault: string | null;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [defaultId, setDefaultId] = useState<string | null>(initialDefault);
  const [filter, setFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    const res = await fetch("/api/accounts");
    const body = await res.json().catch(() => ({}));
    setRefreshing(false);
    if (!res.ok) {
      setError(body.error || "refresh failed");
      return;
    }
    setAccounts(body.accounts);
    router.refresh();
  }

  async function saveDefault(id: string) {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/config/default-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outstand_account_id: id }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error || "save failed");
      return;
    }
    setDefaultId(id);
    router.refresh();
  }

  const filtered = accounts.filter((a) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [a.username, a.displayName, a.outstandAccountId]
      .filter(Boolean)
      .some((s) => String(s).toLowerCase().includes(q));
  });

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Instagram handles connected to Outstand. Pick a default to receive scheduled posts.
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh from Outstand"}
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No accounts yet</CardTitle>
            <CardDescription>
              Connect an Instagram handle in the Outstand dashboard, then click Refresh.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Input
            placeholder="Search handle…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-4 max-w-sm"
          />

          <div className="grid grid-cols-1 gap-2">
            {filtered.map((a) => {
              const isDefault = a.outstandAccountId === defaultId;
              return (
                <Card key={a.outstandAccountId} className={isDefault ? "border-primary" : ""}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <div className="font-medium">
                        @{a.username || a.displayName || a.outstandAccountId}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {a.outstandAccountId}
                      </div>
                    </div>
                    {isDefault ? (
                      <span className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">
                        Default
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveDefault(a.outstandAccountId)}
                        disabled={saving}
                      >
                        Make default
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </>
  );
}
