# AGENTS.md — Interior (Pinterest → Cloudinary → Instagram)

**Read this first in every new Claude session.** Restores project context when the session is cold.

---

## What this project is

A personal automation pipeline for posting **Ahmedabad real estate / interior design** Reels to Instagram. Flow:

```
 Pinterest keyword
      │  (Python downloader, local)
      ▼
 mp4 on disk → Cloudinary CDN
      │  (POST /api/videos/ingest)
      ▼
 Next.js app (Vercel) + Neon Postgres
      │
      ├─ UI: /, /videos, /videos/[id], /accounts, /schedule
      ├─ OpenAI caption generation (Ahmedabad niche — locked)
      ├─ Outstand.so  (Instagram posting)
      │
      ▼
 cron-job.org → POST /api/cron/post-due (every N min)
      │
      ▼
 Instagram Reel goes live
```

---

## Repo layout

```
interior/
├── app/                         Next.js App Router pages + API routes
│   ├── page.tsx                 Dashboard
│   ├── videos/                  list + [id]/page.tsx (detail + actions)
│   ├── accounts/                IG accounts from Outstand
│   ├── schedule/                kanban of scheduled/posted/failed
│   ├── login/                   admin-password sign-in
│   └── api/                     Route handlers (see docs/api.md)
├── components/                  shared UI (nav, shadcn-style primitives)
├── lib/                         server logic
│   ├── db/                      Drizzle schema + neon-http client
│   ├── outstand.ts              Outstand client (port of reelGen TS)
│   ├── captions.ts              OpenAI with locked Ahmedabad prompt
│   ├── cloudinary.ts            video uploads
│   ├── publisher.ts             publish-due orchestration
│   └── session.ts               iron-session auth
├── drizzle/                     SQL migrations
├── scripts/migrate.ts           runs migrations against Neon
├── middleware.ts                redirects unauthenticated browsers → /login
│
├── downloader/                  Python — keeps Pinterest DL logic
│   ├── cli.py                   `python downloader/cli.py "kw" -n 10`
│   ├── pinterest_downloader.py  gallery-dl + yt-dlp + filter
│   ├── ingest.py                Cloudinary upload + POST /api/videos/ingest
│   └── .env                     downloader secrets
│
├── .env.local                   Next.js secrets (gitignored)
├── .env.example                 safe template
└── AGENTS.md                    this file
```

---

## Persistent state

Nothing lives in session memory. If you lose your session, everything reloads from:

| Source                | What it has                                                      |
| --------------------- | ---------------------------------------------------------------- |
| Neon Postgres         | videos, captions, posts, accounts, config (5 tables)             |
| Cloudinary            | mp4 files, served over CDN                                       |
| `.env.local`          | secrets (OUTSTAND, OPENAI, Cloudinary, Neon, cron, admin pw)     |
| `downloader/.env`     | downloader secrets (Cloudinary + API handshake)                  |
| `downloader/` scripts | Python downloader code                                           |

SQLite from the previous iteration is retired. All state is in Neon now.

---

## Session bootstrap (fresh Claude)

1. Read this file.
2. Check `docs/INDEX.md` for deeper references.
3. Verify env is intact:
   ```bash
   grep -E "^(DATABASE_URL|OUTSTAND_API_KEY|CLOUDINARY|OPENAI_API_KEY)" .env.local | wc -l
   # Should be 6+ lines
   ```
4. Quick health check against the DB:
   ```bash
   npx tsx -e "import('./lib/db').then(m => m.db.query.videos.findMany({ limit: 3 })).then(v => console.log('videos:', v.length))"
   ```

---

## Mapping user intent → action

### "Download X videos of KEYWORD"
```bash
.venv/bin/python downloader/cli.py "KEYWORD" -n X
```
Downloads locally → uploads to Cloudinary → POSTs to `/api/videos/ingest` → appears in UI.

Requires the Next.js dev server running (or `APP_URL` in `downloader/.env` pointing at the deployed Vercel URL).

### "Generate captions"
Use the UI: open `/videos/<id>` and click Generate. Or call the API:
```bash
curl -X POST http://localhost:3000/api/videos/<id>/caption -b cookies.txt
```

### "Schedule a post"
UI: `/videos/<id>` → pick account + datetime → Schedule.
API:
```bash
curl -X POST http://localhost:3000/api/videos/<id>/schedule \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"scheduled_at":"2026-04-21T09:00:00+05:30","outstand_account_id":"<id>"}'
```

### "Post whatever is due now"
Normally cron-job.org calls this every N minutes. Manual trigger:
```bash
curl -X POST http://localhost:3000/api/cron/post-due \
  -H "x-cron-secret: $CRON_SECRET"
```

### "Connect my Instagram"
See `docs/instagram-connect.md`. Short version: connect IG handle in the Outstand dashboard, then visit `/accounts` and click "Refresh from Outstand" + "Make default".

---

## Hard rules / niche

Baked into `lib/captions.ts` via env:
- `NICHE_CITY=Ahmedabad`
- `NICHE_TOPICS=real estate, interior design`

**Never** change these without explicit user request. Captions reference Ahmedabad neighborhoods (Bodakdev, SG Highway, Prahlad Nagar, Satellite, Thaltej, South Bopal, Shela, Gota, Vastrapur).

---

## Environment — `.env.local` (Next.js)

```
DATABASE_URL               Neon connection string (direct is fine — undici IPv4 pinning handles pooler needs)
CLOUDINARY_CLOUD_NAME      reused from reelGen
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
OUTSTAND_API_KEY           reused from reelGen
OUTSTAND_BASE_URL          default https://api.outstand.so/v1
OPENAI_API_KEY             reused from reelGen
OPENAI_CAPTION_MODEL       default gpt-4o-mini
NICHE_CITY                 Ahmedabad (don't change)
NICHE_TOPICS               real estate, interior design (don't change)
ADMIN_PASSWORD             single-user login password
SESSION_SECRET             32+ char random — iron-session cookie key
CRON_SECRET                cron-job.org must send this as `x-cron-secret`
INGEST_SECRET              downloader must send this as `x-ingest-secret`
NEXT_PUBLIC_APP_URL        public URL of the deployed app
```

## Environment — `downloader/.env` (Python)

```
APP_URL                    http://localhost:3000 (dev) or Vercel URL
INGEST_SECRET              must match Next.js app
CLOUDINARY_*               direct upload from Python
```

---

## Known gotchas

### Shell env wins over `.env.local`
If you have `OPENAI_API_KEY` exported in your shell (e.g. from `~/.zshrc`), Next.js uses it instead of the one in `.env.local`. Run dev with: `env -u OPENAI_API_KEY npm run dev`. Or unset from your shell.

### Neon IPv6 timeouts
Node 22's fetch prefers IPv6 AAAA records from Neon, which this machine's network can't reach → intermittent ETIMEDOUT. `lib/db/ipv4-bootstrap.ts` force-pins undici to IPv4. Every script that touches Neon imports from `lib/db` (which imports the bootstrap), so this is handled.

### Next.js dev port drifts
`npm run dev` may bind 3000, 3001, 3002… depending on what's free. Check `/tmp/next-dev.log` for the actual port. For stable testing use `PORT=3000 npm run dev` and kill anything holding 3000 first.

### OpenAI key rotation
Reused from `../socialMedia/reelGen/.env`. If that project rotates the key, update here too.

---

## Deployment

See `docs/deploy.md`. Summary:
- `vercel` (imports Git repo, auto-builds on push)
- Vercel env vars = copy of `.env.local` (minus Python-only ones)
- cron-job.org URL: `https://<vercel-domain>/api/cron/post-due`, method POST, header `x-cron-secret: <value>`

The **Python downloader is not deployed to Vercel** — it runs locally. Vercel serverless can't host gallery-dl/yt-dlp/ffmpeg reliably. The downloader POSTs to the Vercel URL to register new videos.

---

## File map pointer

Full per-file docs in `docs/`. Start with `docs/INDEX.md`.
