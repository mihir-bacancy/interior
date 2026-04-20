# Captions

`lib/captions.ts` — OpenAI Chat Completions with a hard-locked system prompt.

## Niche lock

Two env vars, both mandatory:
```
NICHE_CITY=Ahmedabad
NICHE_TOPICS=real estate, interior design
```

These get interpolated into the system prompt. Neighbourhoods referenced occasionally: Bodakdev, SG Highway, Prahlad Nagar, Satellite, Thaltej, South Bopal, Shela, Gota, Vastrapur.

## Format enforced by the prompt

- Line 1: hook (8–14 words)
- Lines 2–3: aesthetic body, occasionally tied to an Ahmedabad neighbourhood
- Line 4: soft CTA (DM / site visit / consultation / save / comment)
- Blank line
- 18–25 hashtags mixing high-volume + Ahmedabad-specific + niche (kitchen, bedroom, pooja room, 2bhk, etc.)

Tone: English + light Hinglish OK. No AI/automation mentions. Max 2–3 emojis. 150–280 chars before hashtags.

## Model

Default: `gpt-4o-mini` (set via `OPENAI_CAPTION_MODEL`). Temperature 0.8, max tokens 500.

## Changing the niche

Don't, unless the user explicitly asks. The prompt hardcodes Ahmedabad neighbourhood names and Gujarat-specific hashtag conventions. Changing `NICHE_CITY` alone won't flip those — you'd need to edit the system prompt in `lib/captions.ts` too.
