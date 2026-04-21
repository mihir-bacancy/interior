/**
 * Schedule every not-yet-scheduled video for @style_o_studio.
 *
 * IST cadence:
 *   Mon–Fri:  random 2–4 reels per day, random times within 16:00–20:00 IST
 *   Sat/Sun:  3 reels per day at ~09:00–10:00, ~13:30–14:30, ~17:30–18:30 IST
 *
 * Start from the next IST calendar day (so the earliest post is tomorrow).
 * Times are jittered per-day so every day looks organic.
 */

import { config as loadEnv } from "dotenv";
import { Agent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
loadEnv({ path: ".env.local", override: true });

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const IST_OFFSET_MIN = 330; // +05:30

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Build a UTC Date from IST Y-M-D h:m. */
function istToUtc(year: number, month1: number, day: number, hour: number, minute: number) {
  // ISO string in IST then subtract the offset
  const ist = new Date(Date.UTC(year, month1 - 1, day, hour, minute));
  return new Date(ist.getTime() - IST_OFFSET_MIN * 60 * 1000);
}

function tomorrowIst(): Date {
  const nowIst = new Date(Date.now() + IST_OFFSET_MIN * 60 * 1000);
  nowIst.setUTCHours(0, 0, 0, 0);
  nowIst.setUTCDate(nowIst.getUTCDate() + 1);
  return nowIst;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}

function istDow(d: Date): number {
  // d is the IST midnight reference (stored as UTC components). getUTCDay works.
  return d.getUTCDay(); // 0=Sun,1=Mon,…,6=Sat
}

function randInt(min: number, max: number) {
  // inclusive
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickWeekdayTimesIst(count: number): Array<{ h: number; m: number }> {
  // 16:00–20:00 IST, at least 45 min apart
  const picks: Array<{ h: number; m: number }> = [];
  let attempts = 0;
  while (picks.length < count && attempts < 200) {
    attempts++;
    const minutes = randInt(16 * 60, 20 * 60 - 1);
    if (picks.some((p) => Math.abs(p.h * 60 + p.m - minutes) < 45)) continue;
    picks.push({ h: Math.floor(minutes / 60), m: minutes % 60 });
  }
  picks.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
  return picks;
}

function pickWeekendTimesIst(): Array<{ h: number; m: number }> {
  // ~09:00–10:00, ~13:30–14:30, ~17:30–18:30
  return [
    (() => { const m = randInt(9 * 60, 10 * 60); return { h: Math.floor(m / 60), m: m % 60 }; })(),
    (() => { const m = randInt(13 * 60 + 30, 14 * 60 + 30); return { h: Math.floor(m / 60), m: m % 60 }; })(),
    (() => { const m = randInt(17 * 60 + 30, 18 * 60 + 30); return { h: Math.floor(m / 60), m: m % 60 }; })(),
  ];
}

async function main() {
  // Resolve account id (env > config)
  let accountId = (process.env.OUTSTAND_IG_ACCOUNT_ID || "").trim();
  if (!accountId) {
    const cfg = await sql`SELECT value FROM config WHERE key = 'default_outstand_account_id'` as unknown as { value: string }[];
    accountId = cfg[0]?.value || "";
  }
  if (!accountId) throw new Error("No default account. Set OUTSTAND_IG_ACCOUNT_ID or insert into config.");

  // Grab videos that have a caption and no existing scheduled/publishing/posted post
  const videos = await sql`
    SELECT v.id AS video_id, c.id AS caption_id
    FROM videos v
    JOIN captions c ON c.id = (
      SELECT id FROM captions WHERE video_id = v.id ORDER BY id DESC LIMIT 1
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM posts p
      WHERE p.video_id = v.id
        AND p.status IN ('scheduled','publishing','posted')
    )
    ORDER BY random()
  ` as unknown as { video_id: number; caption_id: number }[];

  console.log(`▶ ${videos.length} videos to schedule · account ${accountId}`);
  if (!videos.length) {
    console.log("Nothing to do.");
    return;
  }

  // Start the cursor AFTER the latest already-scheduled date so re-runs
  // tack onto the end of the queue instead of colliding with existing slots.
  const latest = await sql`
    SELECT MAX(scheduled_at) AS max_at FROM posts
    WHERE status IN ('scheduled','publishing','posted')
      AND outstand_account_id = ${accountId}
  ` as unknown as { max_at: string | null }[];

  const slots: { whenUtc: Date; videoId: number; captionId: number }[] = [];
  let cursor: Date;
  if (latest[0]?.max_at) {
    const lastUtc = new Date(latest[0].max_at);
    // Convert to IST date, then add 1 day to start fresh the next morning
    const lastIst = new Date(lastUtc.getTime() + IST_OFFSET_MIN * 60 * 1000);
    lastIst.setUTCHours(0, 0, 0, 0);
    cursor = addDays(lastIst, 1);
    console.log(`  resuming from ${cursor.toISOString().slice(0, 10)} (after last scheduled post)`);
  } else {
    cursor = tomorrowIst();
    console.log(`  starting from tomorrow IST`);
  }
  let queueIdx = 0;

  while (queueIdx < videos.length) {
    const dow = istDow(cursor);
    const y = cursor.getUTCFullYear();
    const mo = cursor.getUTCMonth() + 1;
    const d = cursor.getUTCDate();

    let times: Array<{ h: number; m: number }> = [];
    if (dow === 0 || dow === 6) {
      // Sat or Sun
      times = pickWeekendTimesIst();
    } else {
      const n = randInt(2, 4);
      times = pickWeekdayTimesIst(n);
    }

    for (const t of times) {
      if (queueIdx >= videos.length) break;
      const v = videos[queueIdx++];
      slots.push({
        whenUtc: istToUtc(y, mo, d, t.h, t.m),
        videoId: v.video_id,
        captionId: v.caption_id,
      });
    }

    cursor = addDays(cursor, 1);
    // Safety: bail out if this somehow runs >3 months
    if (cursor.getTime() - tomorrowIst().getTime() > 1000 * 60 * 60 * 24 * 120) {
      console.error("Ran past 120 days — aborting");
      break;
    }
  }

  // Insert everything
  let inserted = 0;
  for (const s of slots) {
    await sql`
      INSERT INTO posts (video_id, caption_id, outstand_account_id, scheduled_at, status)
      VALUES (${s.videoId}, ${s.captionId}, ${accountId}, ${s.whenUtc.toISOString()}, 'scheduled')
    `;
    inserted++;
  }

  const first = slots[0];
  const last = slots[slots.length - 1];

  console.log(`\n✓ Inserted ${inserted} posts for account ${accountId}`);
  console.log(`  First: ${first.whenUtc.toISOString()}  (IST ${toIstStr(first.whenUtc)})`);
  console.log(`  Last:  ${last.whenUtc.toISOString()}  (IST ${toIstStr(last.whenUtc)})`);

  // Per-day breakdown
  const byDay = new Map<string, number>();
  for (const s of slots) {
    const key = toIstDateStr(s.whenUtc);
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }
  console.log(`\nPer-day (IST):`);
  for (const [date, count] of [...byDay.entries()].sort()) {
    console.log(`  ${date}  ${count}`);
  }
}

function toIstStr(utc: Date) {
  const ist = new Date(utc.getTime() + IST_OFFSET_MIN * 60 * 1000);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}
function toIstDateStr(utc: Date) {
  const ist = new Date(utc.getTime() + IST_OFFSET_MIN * 60 * 1000);
  const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} (${dowNames[ist.getUTCDay()]})`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
