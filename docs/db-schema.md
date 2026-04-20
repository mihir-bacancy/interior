# DB schema — Neon Postgres

Source of truth: `lib/db/schema.ts`. Migrations are generated with `drizzle-kit generate` and applied via `scripts/migrate.ts`.

## Tables

### `videos`
Every Pinterest pin we've ingested. `pin_id` is unique, so re-running the downloader is idempotent.

| column                 | type                    | notes                                         |
| ---------------------- | ----------------------- | --------------------------------------------- |
| id                     | serial PK               |                                               |
| pin_id                 | text, unique            | Pinterest pin id                              |
| keyword                | text                    | search term that surfaced this pin            |
| title                  | text                    | Pinterest grid title, nullable                |
| cloudinary_url         | text                    | canonical public mp4 URL                      |
| cloudinary_public_id   | text                    | for future deletes                            |
| local_path             | text                    | where the file sits on the downloader machine |
| source_url             | text                    | original Pinterest HLS URL                    |
| width / height         | integer                 |                                               |
| duration_ms            | integer                 |                                               |
| downloaded_at          | timestamptz, default now |                                              |
| used_for_post          | integer, default 0      | flipped to 1 when the first post publishes    |

### `captions`
Multiple allowed per video. Latest wins.

### `posts`
Publishing queue. Status values: `scheduled`, `publishing`, `posted`, `failed`.

### `accounts`
Cached Instagram accounts from Outstand. Keyed by `outstand_account_id`. `/api/accounts` refreshes from Outstand and upserts.

### `config`
Key/value store. Notable keys:
- `default_outstand_account_id` — used when scheduling without an explicit account.

## Common queries

```sql
-- Videos ready to schedule
SELECT v.id, v.title, c.text
FROM videos v
JOIN captions c ON c.video_id = v.id
WHERE v.used_for_post = 0
ORDER BY v.downloaded_at DESC;

-- Upcoming
SELECT id, scheduled_at, video_id, status FROM posts
WHERE status = 'scheduled'
ORDER BY scheduled_at;

-- Retry a failure
UPDATE posts SET status = 'scheduled', error_message = NULL WHERE id = <N>;

-- Unpost (remove from feed — not actually; Outstand doesn't support recall)
-- Just delete the row if you haven't published yet.
DELETE FROM posts WHERE id = <N> AND status = 'scheduled';
```

## Running migrations

```bash
npx drizzle-kit generate     # create a new .sql from schema changes
npx tsx scripts/migrate.ts   # apply to Neon (IPv4-pinned)
```

Do **not** use `drizzle-kit push` — it tries a WebSocket that intermittently fails on this network.
