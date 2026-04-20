# Deploy

## Vercel

1. Push this repo to GitHub.
2. Import the project in Vercel (defaults are fine — it detects Next.js automatically).
3. In Vercel → Settings → Environment Variables, copy every line from `.env.local` **except** `NEXT_PUBLIC_APP_URL` (Vercel sets its own domain). Add them for `Production`, `Preview`, and `Development`.
4. Deploy.
5. Run migrations against Neon once from your machine (Vercel deploy does not run migrations):
   ```bash
   npx tsx scripts/migrate.ts
   ```
6. After deploy, update two things:
   - In `downloader/.env` locally: set `APP_URL=https://<your-vercel-domain>` so the downloader posts to prod.
   - In Vercel env: set `NEXT_PUBLIC_APP_URL=https://<your-vercel-domain>`.

## cron-job.org

You chose external cron (cron-job.org) over Vercel Cron.

1. Sign up / log in at https://cron-job.org.
2. Create a new job:
   - **URL:** `https://<your-vercel-domain>/api/cron/post-due`
   - **Schedule:** every 5 minutes (or whatever granularity you want — 5 min is fine; posts still fire near their exact scheduled time)
   - **Request method:** POST
   - **Advanced → Headers:**
     - Name: `x-cron-secret`
     - Value: _the value of your `CRON_SECRET` env var_
   - **Timeout:** 60 seconds (cron-job.org default is 30 — posting + upload can take 10-20s per video, bump this)
3. Save + enable.
4. Verify with a manual "Execute now" from the cron-job.org dashboard. It should get a `200` response with `{ ok: true, count: 0, results: [] }` if nothing is due.

If you see `401 unauthorized`, the `x-cron-secret` header isn't matching — re-copy the env var value (no extra whitespace, no surrounding quotes).

## Python downloader

**Do not deploy.** Runs locally from `downloader/` on your machine:

```bash
.venv/bin/python downloader/cli.py "modular kitchen ahmedabad" -n 10
```

When `APP_URL` points at the deployed Vercel URL, the downloader's ingest call will hit prod automatically.

## Secrets hygiene

- Never commit `.env.local` or `downloader/.env` — both are in `.gitignore`.
- Rotate `CRON_SECRET` / `INGEST_SECRET` / `SESSION_SECRET` any time you suspect a leak. Just generate new random strings (`openssl rand -hex 32`) and update both Vercel env and `.env.local`.
- `ADMIN_PASSWORD` is single-user. Change from the default before production.
