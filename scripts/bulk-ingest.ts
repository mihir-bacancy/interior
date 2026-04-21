/**
 * Scan ~/Downloads/pinterest/<keyword>/*.mp4, upload each to Cloudinary,
 * insert into Neon. Idempotent on `pin_id`.
 *
 * Assumes filenames of the form  {pin_id}_{safe_title}.mp4 produced by the
 * Python downloader.
 */

import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";

import { config as loadEnv } from "dotenv";
import { Agent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
loadEnv({ path: ".env.local", override: true });

// After env is loaded
import { v2 as cloudinary } from "cloudinary";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const ROOT = join(homedir(), "Downloads", "pinterest");

type Candidate = {
  pinId: string;
  keyword: string;
  title: string | null;
  path: string;
};

function readableKeyword(folder: string): string {
  return folder.replace(/_/g, " ");
}

function parseFilename(fname: string): { pinId: string; title: string | null } | null {
  const stem = fname.replace(/\.mp4$/i, "");
  const m = stem.match(/^(\d+)_?(.*)$/);
  if (!m) return null;
  const pinId = m[1];
  const raw = (m[2] || "").trim().replace(/_/g, " ");
  const title = raw && raw !== pinId ? raw : null;
  return { pinId, title };
}

function scan(): Candidate[] {
  const found: Candidate[] = [];
  for (const folder of readdirSync(ROOT)) {
    const full = join(ROOT, folder);
    if (!statSync(full).isDirectory()) continue;
    const keyword = readableKeyword(folder);
    for (const f of readdirSync(full)) {
      if (!f.toLowerCase().endsWith(".mp4")) continue;
      const parsed = parseFilename(f);
      if (!parsed) continue;
      found.push({
        pinId: parsed.pinId,
        keyword,
        title: parsed.title,
        path: join(full, f),
      });
    }
  }
  return found;
}

async function main() {
  const all = scan();
  console.log(`▶ Found ${all.length} local mp4s`);

  // Dedupe DB rows
  const existing: { pin_id: string }[] = await sql`SELECT pin_id FROM videos` as never;
  const seen = new Set(existing.map((r) => r.pin_id));
  const todo = all.filter((c) => !seen.has(c.pinId));
  console.log(`  ${seen.size} already in DB — ${todo.length} to ingest`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < todo.length; i++) {
    const c = todo[i];
    const label = `[${i + 1}/${todo.length}] ${c.pinId} ${c.title || c.keyword}`;
    try {
      const safeKw = c.keyword.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
      const publicId = `${safeKw}_${c.pinId}`;

      // Upload to Cloudinary (resource_type video)
      const upload = await cloudinary.uploader.upload(c.path, {
        resource_type: "video",
        folder: "interior",
        public_id: publicId,
        overwrite: false,
      });

      // Insert into Neon
      await sql`
        INSERT INTO videos (
          pin_id, keyword, title, cloudinary_url, cloudinary_public_id,
          local_path, width, height, duration_ms
        ) VALUES (
          ${c.pinId}, ${c.keyword}, ${c.title},
          ${upload.secure_url}, ${upload.public_id},
          ${c.path}, ${upload.width ?? null}, ${upload.height ?? null},
          ${upload.duration ? Math.round(upload.duration * 1000) : null}
        )
        ON CONFLICT (pin_id) DO NOTHING
      `;

      ok++;
      console.log(`  ✓ ${label}  →  ${upload.secure_url}`);
    } catch (err: unknown) {
      fail++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${label}: ${msg}`);
    }
  }

  console.log(`\nDone. ${ok} ingested · ${fail} failed · ${seen.size} already existed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
