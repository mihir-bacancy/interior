import { NextResponse } from "next/server";

import { db, accounts } from "@/lib/db";
import { listInstagramAccounts } from "@/lib/outstand";
import { requireAuth } from "@/lib/session";

/** List Outstand IG accounts, caching them in our DB so UI is fast. */
export async function GET() {
  try { await requireAuth(); } catch (e) { return e as Response; }

  const fresh = await listInstagramAccounts();

  // Upsert each into our cache
  for (const a of fresh) {
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
  return NextResponse.json({ accounts: cached, source: "outstand" });
}
