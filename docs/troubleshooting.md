# Troubleshooting

## `fetch failed ETIMEDOUT` talking to Neon

Node 22 prefers IPv6 from DNS; Neon's AAAA addresses aren't reachable from every network.

`lib/db/ipv4-bootstrap.ts` pins undici to IPv4 and is imported automatically by anything using `lib/db`. If you write a standalone script that imports `@neondatabase/serverless` directly, add this first:

```ts
import { Agent, setGlobalDispatcher } from "undici";
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));
```

## OpenAI `401 Incorrect API key`

Your shell has `OPENAI_API_KEY` exported, and that wins over `.env.local`. Run dev with:
```bash
env -u OPENAI_API_KEY npm run dev
```
Or `unset OPENAI_API_KEY` before starting.

## Dev server binds a weird port

`npm run dev` walks upward from 3000 if it's busy. Check the actual port:
```bash
grep Local /tmp/next-dev.log
```
Or force one:
```bash
PORT=3000 npm run dev
```
Remember to update `downloader/.env:APP_URL` if you change the port.

## Pinterest search returns 0 video candidates

- Keyword too narrow → broaden.
- gallery-dl rate-limited → wait a few minutes, retry.
- Raise `MIN_SCAN` in `downloader/pinterest_downloader.py` if you regularly need more.

## Too many videos rejected by the Reels filter

Loosen thresholds in `downloader/pinterest_downloader.py`:
```python
MIN_ASPECT = 0.45   # allow wider
MAX_ASPECT = 0.70
MAX_DURATION_MS = 90_000
```
Or just pass `--no-filter` on the CLI.

## Ingest API returns `401`

`INGEST_SECRET` in `downloader/.env` doesn't match the Next.js app's env. Re-copy both sides.

## Cron endpoint returns `401`

Same — `x-cron-secret` header value doesn't match `CRON_SECRET` in Vercel env.

## Post stays `publishing` forever

Two possibilities:
- The Next.js process crashed mid-publish (local dev kill, Vercel timeout). Manually reset:
  ```sql
  UPDATE posts SET status='scheduled', error_message=NULL WHERE id=<N> AND status='publishing';
  ```
- Outstand took the request but the response hung. Check Outstand dashboard; if the post shows there as submitted, manually update:
  ```sql
  UPDATE posts SET status='posted', outstand_post_id='<from_dashboard>' WHERE id=<N>;
  ```

## Video uploaded twice to Cloudinary

The ingest API is idempotent on `pin_id`, but if Cloudinary is called *before* the DB check (which happens when `cloudinary_url` is not passed in the ingest body), you get a stale orphan. The downloader always passes `cloudinary_url`, so this only happens if you ingest from somewhere else.

## Retry a failed post

```bash
# Find the failure
psql $DATABASE_URL -c "SELECT id, error_message FROM posts WHERE status='failed';"
# Reset
psql $DATABASE_URL -c "UPDATE posts SET status='scheduled', error_message=NULL WHERE id=<N>;"
# Let cron pick it up, or run it now:
curl -X POST https://<app>/api/cron/post-due -H "x-cron-secret: $CRON_SECRET"
```
