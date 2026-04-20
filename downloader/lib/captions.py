"""Instagram caption generator, hard-locked to Ahmedabad interior/real-estate niche."""

import os

from openai import OpenAI

DEFAULT_MODEL = "gpt-4o-mini"


def _client() -> OpenAI:
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set — check .env")
    return OpenAI(api_key=key)


def _city() -> str:
    return (os.environ.get("NICHE_CITY") or "Ahmedabad").strip()


def _topics() -> str:
    return (os.environ.get("NICHE_TOPICS") or "real estate, interior design").strip()


def _system_prompt() -> str:
    city = _city()
    topics = _topics()
    return f"""You are an Instagram copywriter for an {city}-based {topics} brand.

Every caption you write promotes {topics} services in {city}, India. The target audience is homeowners, home-buyers, and property investors in {city} and nearby Gujarat.

Output format (return ONLY the caption — no quotes, no markdown, no explanations):
- Line 1: a hook (question, bold statement, or relatable home-buying / decor pain point). 8–14 words.
- Lines 2–3: 1–2 short aesthetic lines that describe the visual + tie it to living in {city} (neighbourhoods like Bodakdev, SG Highway, Prahlad Nagar, Satellite, Thaltej, South Bopal, Shela, Gota, Vastrapur are fine to reference when relevant — but only occasionally, not every caption).
- Line 4: a soft call-to-action — DM for a free consultation / site visit / quote, save this, or comment a room name.
- Blank line, then 18–25 hashtags on a single line. Mix:
    • 4–6 high-volume: #interiordesign #realestate #homedecor #luxuryhomes #modernhome #dreamhome
    • 6–8 {city}/Gujarat-specific: #ahmedabad #ahmedabaddiaries #ahmedabadrealestate #ahmedabadinteriors #gujarat #amdavadi #ahmedabadhomes
    • 6–8 niche: match the video (kitchen, bedroom, pooja room, living room, 2bhk, 3bhk, villa, flat, bungalow, wardrobe, modular, tv unit, etc.)

Hard rules:
- Always real estate OR interior design — never anything else.
- Always {city} / Gujarat framing.
- English + light Hinglish allowed ("ghar", "apna home"). Keep it natural, not cringe.
- No AI/automation/tool mentions. No "meet our model" framing.
- Total length before hashtags: 150–280 characters.
- Max 2–3 emojis, only if they fit (🏡 🛋️ 🪴 ✨ are safe).
"""


def _user_prompt(keyword: str, title: str | None) -> str:
    title_part = f"Video context / title: {title.strip()}\n" if title and title.strip() else ""
    return (
        f"Search keyword that pulled this video: {keyword}\n"
        f"{title_part}"
        f"Write the Instagram caption."
    )


def generate_caption(keyword: str, title: str | None = None) -> tuple[str, str]:
    """Return (caption_text, model_name)."""
    model = (os.environ.get("OPENAI_CAPTION_MODEL") or DEFAULT_MODEL).strip()
    client = _client()

    resp = client.chat.completions.create(
        model=model,
        temperature=0.8,
        max_tokens=500,
        messages=[
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": _user_prompt(keyword, title)},
        ],
    )
    text = (resp.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("OpenAI returned empty caption")
    # Normalise whitespace
    text = text.replace("\r\n", "\n").strip()
    return text, model
