"""Pinterest downloader → Cloudinary → Next.js API.

Usage:
    .venv/bin/python downloader/cli.py "interior design" -n 10

The rest of the pipeline (caption, schedule, post) lives in the Next.js app.
"""

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

from pinterest_downloader import run as run_download  # noqa: E402
from ingest import upload_and_register  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Download Pinterest videos → Cloudinary → Next.js app.")
    parser.add_argument("keyword", help='e.g. "interior design"')
    parser.add_argument("-n", "--count", type=int, default=10)
    parser.add_argument(
        "-o", "--output",
        default=str(Path.home() / "Downloads" / "pinterest"),
        help="Local mp4 staging directory",
    )
    parser.add_argument("--no-filter", action="store_true", help="Disable 9:16 / <90s filter")
    parser.add_argument(
        "--skip-ingest", action="store_true",
        help="Only download locally (don't upload to Cloudinary / notify app)",
    )
    args = parser.parse_args()

    downloaded = run_download(
        keyword=args.keyword,
        count=args.count,
        out_root=Path(args.output).expanduser(),
        strict_reels=not args.no_filter,
    )

    if args.skip_ingest:
        print(f"\nSkipped ingest. {len(downloaded)} videos on disk only.")
        return

    if not downloaded:
        return

    print(f"\n▶ Uploading {len(downloaded)} videos to Cloudinary + registering with app…\n")
    ok = 0
    deduped = 0
    failed = 0
    for i, rec in enumerate(downloaded, 1):
        try:
            result = upload_and_register(rec)
            if result.get("deduped"):
                deduped += 1
                print(f"[{i}/{len(downloaded)}] ~ deduped (already ingested): {rec['pin_id']}")
            else:
                ok += 1
                print(f"[{i}/{len(downloaded)}] ✓ {result['cloudinary_url']}")
        except Exception as e:
            failed += 1
            print(f"[{i}/{len(downloaded)}] ✗ {e}", file=sys.stderr)

    print(f"\nSummary: {ok} new · {deduped} existing · {failed} failed")


if __name__ == "__main__":
    main()
