import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { config as loadEnv } from "dotenv";
import { Agent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
loadEnv({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set (check .env.local)");
}

async function main() {
  const sql = neon(url!);
  const dir = "./drizzle";
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    console.log(`▶ applying ${file}`);
    const raw = readFileSync(join(dir, file), "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        await (sql as unknown as (q: string) => Promise<unknown>)(stmt);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/already exists/i.test(msg)) {
          console.log(`  ~ skip (already exists)`);
          continue;
        }
        console.error(`  ✗ ${msg}`);
        throw err;
      }
    }
    console.log(`  ✓ ok`);
  }

  console.log("migrations complete");
}

main();
