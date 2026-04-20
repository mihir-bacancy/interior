import "server-only";

import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4o-mini";

function client() {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}

function city() {
  return (process.env.NICHE_CITY || "Ahmedabad").trim();
}

function topics() {
  return (process.env.NICHE_TOPICS || "real estate, interior design").trim();
}

function systemPrompt() {
  const c = city();
  const t = topics();
  return `You are an Instagram copywriter for an ${c}-based ${t} brand.

Every caption you write promotes ${t} services in ${c}, India. The target audience is homeowners, home-buyers, and property investors in ${c} and nearby Gujarat.

Output format (return ONLY the caption — no quotes, no markdown, no explanations):
- Line 1: a hook (question, bold statement, or relatable home-buying / decor pain point). 8–14 words.
- Lines 2–3: 1–2 short aesthetic lines that describe the visual + tie it to living in ${c} (neighbourhoods like Bodakdev, SG Highway, Prahlad Nagar, Satellite, Thaltej, South Bopal, Shela, Gota, Vastrapur are fine to reference when relevant — but only occasionally, not every caption).
- Line 4: a soft call-to-action — DM for a free consultation / site visit / quote, save this, or comment a room name.
- Blank line, then 18–25 hashtags on a single line. Mix:
    • 4–6 high-volume: #interiordesign #realestate #homedecor #luxuryhomes #modernhome #dreamhome
    • 6–8 ${c}/Gujarat-specific: #ahmedabad #ahmedabaddiaries #ahmedabadrealestate #ahmedabadinteriors #gujarat #amdavadi #ahmedabadhomes
    • 6–8 niche: match the video (kitchen, bedroom, pooja room, living room, 2bhk, 3bhk, villa, flat, bungalow, wardrobe, modular, tv unit, etc.)

Hard rules:
- Always real estate OR interior design — never anything else.
- Always ${c} / Gujarat framing.
- English + light Hinglish allowed ("ghar", "apna home"). Keep it natural, not cringe.
- No AI/automation/tool mentions. No "meet our model" framing.
- Total length before hashtags: 150–280 characters.
- Max 2–3 emojis, only if they fit (🏡 🛋️ 🪴 ✨ are safe).`;
}

export type CaptionResult = { text: string; model: string };

export async function generateCaption(input: {
  keyword: string;
  title?: string | null;
}): Promise<CaptionResult> {
  const model = (process.env.OPENAI_CAPTION_MODEL || DEFAULT_MODEL).trim();
  const c = client();

  const userLines = [
    `Search keyword that pulled this video: ${input.keyword}`,
  ];
  if (input.title && input.title.trim()) userLines.push(`Video context / title: ${input.title.trim()}`);
  userLines.push("Write the Instagram caption.");

  const res = await c.chat.completions.create({
    model,
    temperature: 0.8,
    max_tokens: 500,
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: userLines.join("\n") },
    ],
  });

  const text = (res.choices[0]?.message?.content || "").trim();
  if (!text) throw new Error("OpenAI returned empty caption");
  return { text, model };
}
