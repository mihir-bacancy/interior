# API reference

Base URL in dev: `http://localhost:3000` (or whatever port Next.js binds — check `/tmp/next-dev.log`).
Base URL in prod: `https://<your-vercel-domain>`.

All error responses are `{ error: string, ... }`. Success responses are `{ ok: true, ... }` or a resource body.

---

## Auth

### `POST /api/auth/login`
Body: `{ "password": "<ADMIN_PASSWORD>" }`
Sets `interior_session` cookie. 401 on bad password.

### `POST /api/auth/logout`
Destroys the cookie.

---

## Videos

### `POST /api/videos/ingest`  —  downloader handshake
Auth: `x-ingest-secret` header.

```json
{
  "pin_id": "1020769…",
  "keyword": "interior design",
  "title": "Luxurious Pooja Room…",
  "cloudinary_url": "https://res.cloudinary.com/…/interior/….mp4",
  "cloudinary_public_id": "interior/interior_design_1020769…",
  "source_url": "https://…pinimg.com/….m3u8",
  "local_path": "/Users/…/interior_design/….mp4",
  "width": 2160,
  "height": 3840,
  "duration_ms": 21550
}
```

If the `cloudinary_url` is omitted, the API will upload from `source_url` itself. If `pin_id` already exists, returns `{ deduped: true }`.

### `GET /api/videos`
Auth: session cookie.
Returns every video with its latest caption attached.

### `POST /api/videos/[id]/caption`
Auth: session cookie.
Generates a new caption via OpenAI using the Ahmedabad niche prompt. Returns the caption row.

### `POST /api/videos/[id]/schedule`
Auth: session cookie.

```json
{
  "scheduled_at": "2026-04-21T09:00:00+05:30",
  "outstand_account_id": "optional-override",
  "caption_id": 42
}
```

Priority for caption: `caption_id` in body > latest existing caption > generate new.
Priority for account: `outstand_account_id` in body > `config.default_outstand_account_id` > `OUTSTAND_IG_ACCOUNT_ID` env.

---

## Accounts

### `GET /api/accounts`
Auth: session cookie.
Hits Outstand, upserts into the `accounts` cache table, returns the cache.

### `POST /api/config/default-account`
Auth: session cookie.
Body: `{ "outstand_account_id": "<id>" }`
Sets the default account used when scheduling without an explicit override.

---

## Posts

### `GET /api/posts`
Auth: session cookie.
Returns every post with video + caption joined in. For the Schedule page.

---

## Cron

### `POST /api/cron/post-due`
Auth: `x-cron-secret` header.

Picks up every `posts.status = 'scheduled' AND scheduled_at <= now()`, and publishes each via Outstand:
1. Upload Cloudinary mp4 to Outstand (`POST /media/upload` → `PUT <url>` → `POST /media/{id}/confirm`)
2. `POST /posts/` on Outstand with the caption + media URL
3. Update the posts row (`status='posted'`, `outstand_post_id`, `posted_at`) + set `videos.used_for_post=1`

Returns `{ ok: true, count, results: [{postId, outstandPostId?, status, error?}, …] }`.

`GET` is aliased to `POST` for easy manual retrigger.
