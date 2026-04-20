# Architecture

Two runtimes, one DB.

```
┌─────────────────────────────┐         ┌────────────────────────────────┐
│ downloader/  (Python, local)│         │  Next.js app  (Vercel)          │
│                             │         │                                 │
│  gallery-dl → yt-dlp        │         │  Dashboard / Videos / Schedule  │
│  9:16 + <90s filter         │         │  /api/videos/ingest             │
│  Cloudinary upload          │────────▶│  /api/videos/[id]/caption       │
│  POST /api/videos/ingest    │ HTTP    │  /api/videos/[id]/schedule      │
│                             │         │  /api/accounts                  │
└─────────────────────────────┘         │  /api/cron/post-due ◀───────────┤
                                        │                                 │ cron-job.org
                                        │  OpenAI  (captions)             │ every N min
                                        │  Outstand.so (IG posting)       │
                                        └─────────────┬───────────────────┘
                                                      │
                                                 Neon Postgres
                                              videos / captions /
                                              posts / accounts / config
```

## Why this split

**Python stays local** because gallery-dl, yt-dlp, and ffmpeg don't run reliably on Vercel's serverless runtime (no persistent disk, 10s default timeout, no ffmpeg binary). Running them locally also means the Pinterest scraping traffic comes from a home IP, not a datacenter, which is less likely to be rate-limited.

**Next.js on Vercel** handles everything stateless: REST API, dashboard UI, caption generation, Outstand calls, cron-triggered publishing. Auto-deploy from Git.

**Neon** is the single source of truth for pipeline state. Local downloader is stateless — re-running it multiple times is safe because the ingest API uses `pin_id` as the unique key.

**Cloudinary** is the media store. The downloader uploads mp4s directly, gets back a persistent public URL, and hands that URL to the Next.js app. When it's time to post, the publisher downloads from Cloudinary and hands to Outstand.

**Outstand.so** is the Instagram posting service. We reuse the API key from `../socialMedia/reelGen/.env`. Outstand handles Instagram Graph API + OAuth + media upload — we just hand it a public media URL and a caption.

## Auth

| Surface                     | Auth                                     |
| --------------------------- | ---------------------------------------- |
| `/` and other UI pages      | Cookie from `iron-session` login         |
| `/api/auth/*`               | Password POST                            |
| `/api/videos/*` (not ingest) | Session cookie (`requireAuth()`)         |
| `/api/videos/ingest`        | Header `x-ingest-secret: <INGEST_SECRET>` |
| `/api/cron/post-due`        | Header `x-cron-secret: <CRON_SECRET>`    |

## State machine (posts table)

```
scheduled ──▶ publishing ──┬──▶ posted
                           └──▶ failed
```

`cron-job.org` hits `/api/cron/post-due` → picks up any `scheduled` row where `scheduled_at <= now()` → flips to `publishing` → uploads to Outstand → flips to `posted` or `failed`.

To retry a failed post:
```sql
UPDATE posts SET status = 'scheduled', error_message = NULL WHERE id = <N>;
```
