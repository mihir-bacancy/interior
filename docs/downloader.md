# Python downloader

Lives at `downloader/`. Owns exactly one thing: pull mp4s from Pinterest into Cloudinary, then tell the Next.js app about them.

## One-time setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r downloader/requirements.txt
```

`ffmpeg` on PATH is required (`brew install ffmpeg`).

## Usage

```bash
.venv/bin/python downloader/cli.py "interior design" -n 10
.venv/bin/python downloader/cli.py "modular kitchen ahmedabad" -n 20
.venv/bin/python downloader/cli.py "pooja room" -n 5 --no-filter  # skip 9:16/<90s filter
.venv/bin/python downloader/cli.py "interior design" -n 10 --skip-ingest  # local only
```

Output (example):
```
▶ Searching Pinterest: 'interior design'  (scanning up to 60 pins)
  found 6 video candidates
  10 pass filter → downloading to ~/Downloads/pinterest/interior_design
[1/10] 1080x1920 23.3s  980166306382223163_contemporary_chic….mp4
…
▶ Uploading 10 videos to Cloudinary + registering with app…
[1/10] ✓ https://res.cloudinary.com/ds7f7fspg/video/upload/v…/interior/….mp4
Summary: 10 new · 0 existing · 0 failed
```

## How the filter works

From `pinterest_downloader.py`:
- Aspect ratio: `0.45 ≤ w/h ≤ 0.70` (9:16 target with tolerance)
- Duration: `3s ≤ d ≤ 90s`
- Can be disabled with `--no-filter`

Search oversamples by `OVERSAMPLE_FACTOR = 10` because Pinterest search returns mostly images + some videos get rejected.

## Handshake with the Next.js app

1. Upload mp4 to Cloudinary (folder `interior`, public_id `{keyword}_{pin_id}`).
2. `POST <APP_URL>/api/videos/ingest` with header `x-ingest-secret: <INGEST_SECRET>` and the pin metadata + cloudinary URL.
3. If `pin_id` already exists, the API returns `{ deduped: true }` and the downloader reports it as "existing".

## Env vars (`downloader/.env`)

```
APP_URL                Next.js app URL (localhost in dev, Vercel domain in prod)
INGEST_SECRET          must match the Next.js env
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

## Legacy

`downloader/lib/` and `downloader/cli.py` have remnants of the old Python-only pipeline (captions/outstand/publisher). The current `cli.py` only uses `pinterest_downloader.py` + `ingest.py`. The legacy modules are harmless but unused — delete them later if the repo feels cluttered.
