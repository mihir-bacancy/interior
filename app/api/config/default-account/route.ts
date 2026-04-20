import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db, config } from "@/lib/db";
import { requireAuth } from "@/lib/session";

const body = z.object({ outstand_account_id: z.string().min(1) });

export async function POST(req: NextRequest) {
  try { await requireAuth(); } catch (e) { return e as Response; }

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });

  await db
    .insert(config)
    .values({ key: "default_outstand_account_id", value: parsed.data.outstand_account_id })
    .onConflictDoUpdate({
      target: config.key,
      set: { value: parsed.data.outstand_account_id },
    });

  return NextResponse.json({ ok: true });
}
