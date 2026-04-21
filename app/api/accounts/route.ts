import { NextResponse } from "next/server";

import { db, accounts } from "@/lib/db";
import { listInstagramAccounts } from "@/lib/outstand";
import { requireAuth } from "@/lib/session";

/** List Outstand IG accounts, caching them in our DB so UI is fast.
 *
 * If ALLOWED_IG_USERNAMES is set (comma-separated), only accounts whose
 * username matches are synced — the Outstand API key has ~50 unrelated
 * handles attached, and we only want to manage our own. */
export async function GET() {
  try { await requireAuth(); } catch (e) { return e as Response; }

  const allowlist = (process.env.ALLOWED_IG_USERNAMES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  let fresh;
  try {
    fresh = await listInstagramAccounts();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "outstand_fetch_failed", details: msg, hasKey: !!process.env.OUTSTAND_API_KEY },
      { status: 502 }
    );
  }
  const scoped = allowlist.length
    ? fresh.filter((a) => allowlist.includes((a.username || "").toLowerCase()))
    : fresh;

  for (const a of scoped) {
    await db
      .insert(accounts)
      .values({
        outstandAccountId: a.id,
        username: a.username ?? null,
        displayName: a.displayName ?? null,
        avatarUrl: a.avatarUrl ?? null,
      })
      .onConflictDoUpdate({
        target: accounts.outstandAccountId,
        set: {
          username: a.username ?? null,
          displayName: a.displayName ?? null,
          avatarUrl: a.avatarUrl ?? null,
        },
      });
  }

  const cached = await db.select().from(accounts);
  return NextResponse.json({ accounts: cached, source: "outstand", allowlist });
}
