/**
 * For every video without a caption, generate one via OpenAI and insert.
 * Idempotent — only fills gaps.
 */

import { config as loadEnv } from "dotenv";
import { Agent, setGlobalDispatcher } from "undici";

setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
loadEnv({ path: ".env.local", override: true });

import { neon } from "@neondatabase/serverless";
import OpenAI from "openai";

const sql = neon(process.env.DATABASE_URL!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function systemPrompt(city: string, topics: string) {
  return `You are an Instagram copywriter for an ${city}-based ${topics} brand (@style_o_studio).

Every caption must:
- Promote ${topics} services in ${city}, India ONLY. Audience: homeowners, home-buyers, and property investors in ${city} and nearby Gujarat.
- End with a CTA that explicitly asks the reader to DM if they want ${topics} like what's shown. Example phrasings: "DM us to create this home", "Want a home like this? DM us in ${city}", "Book a free consultation — DM us".

Output format (return ONLY the caption — no quotes, no markdown, no preamble):

[Hook line] — a question, bold claim, or relatable home-buying / decor pain point. 8–14 words.

[2–3 aesthetic body lines] describing what's in the video + tying it to ${city} living. Reference a neighbourhood when it fits naturally (pick one only when relevant, not every time):
Bodakdev · SG Highway · Prahlad Nagar · Satellite · Thaltej · South Bopal · Shela · Gota · Vastrapur · Sindhu Bhavan Road · Science City · Chandkheda · Naranpura · Paldi.

[Key details line] — 2-4 short factual call-outs separated by · (e.g. "Matte-finish modular · Quartz countertop · Under-cabinet LEDs · ${city} built 2024"). Make these specific to the video — don't repeat generic words.

[CTA line] — one sentence. Must explicitly invite a DM to create this type of home. Examples:
"DM us to create a home like this in ${city} 🏡"
"Want this for your home? DM @style_o_studio — based in ${city}."

[blank line]

[hashtags] — 22–28 hashtags on a single line, no commas. Mix:
  • 6–8 high-volume: #interiordesign #realestate #homedecor #luxuryhomes #modernhome #dreamhome #homeinspo #interiorinspo
  • 8–10 ${city}/Gujarat-specific: #ahmedabad #ahmedabaddiaries #ahmedabadrealestate #ahmedabadinteriors #ahmedabadhomes #gujarat #amdavadi #ahmedabadinteriordesigner #gujaratinteriors #ahmedabadlife
  • 6–10 niche-to-video (pick words that match the room/feature shown).

Hard rules:
- Caption text before hashtags: 220–360 characters.
- Exactly ONE blank line between body and hashtags.
- Max 2–3 emojis total (safe: 🏡 🛋️ ✨ 🪴 💫).
- Never mention AI/automation. Never say "Meet our model". Always ${city}/Gujarat framing.`;
}

type Video = {
  id: number;
  pin_id: string;
  keyword: string;
  title: string | null;
};

async function main() {
  const city = process.env.NICHE_CITY || "Ahmedabad";
  const topics = process.env.NICHE_TOPICS || "real estate, interior design";
  const model = process.env.OPENAI_CAPTION_MODEL || "gpt-4o-mini";

  const rows = await sql`
    SELECT v.id, v.pin_id, v.keyword, v.title
    FROM videos v
    LEFT JOIN captions c ON c.video_id = v.id
    WHERE c.id IS NULL
    ORDER BY v.id
  ` as unknown as Video[];

  console.log(`▶ ${rows.length} videos need captions`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const v = rows[i];
    const label = `[${i + 1}/${rows.length}] video #${v.id}`;
    try {
      const userLines = [`Search keyword that pulled this video: ${v.keyword}`];
      if (v.title) userLines.push(`Video context / title: ${v.title}`);
      userLines.push("Write the Instagram caption following every rule in the system prompt.");

      const res = await openai.chat.completions.create({
        model,
        temperature: 0.85,
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt(city, topics) },
          { role: "user", content: userLines.join("\n") },
        ],
      });

      const text = (res.choices[0]?.message?.content || "").trim();
      if (!text) throw new Error("empty");

      await sql`
        INSERT INTO captions (video_id, text, model)
        VALUES (${v.id}, ${text}, ${model})
      `;

      ok++;
      const firstLine = text.split("\n")[0];
      console.log(`  ✓ ${label}  ${firstLine.slice(0, 80)}`);
    } catch (err: unknown) {
      fail++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${label}: ${msg}`);
    }
  }

  console.log(`\nDone. ${ok} captioned · ${fail} failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
