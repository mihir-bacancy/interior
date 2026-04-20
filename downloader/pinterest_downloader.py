"""Download Pinterest videos by keyword, filtered to Reels-friendly format (9:16, <90s).

Two-phase:
  1. gallery-dl  — search Pinterest and dump pin metadata (stable, handles auth/pagination).
  2. yt-dlp      — download the HLS streams of filtered pins to mp4.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

from yt_dlp import YoutubeDL

# Reels constraints
MIN_ASPECT = 0.45
MAX_ASPECT = 0.70
MAX_DURATION_MS = 90_000
MIN_DURATION_MS = 3_000

# How many search items to scan per requested download. Pinterest search
# returns a mix of images and videos; only ~1/4 are videos, and some get
# rejected by the Reels filter.
OVERSAMPLE_FACTOR = 10
MIN_SCAN = 60


def safe_name(text, max_len=60):
    text = re.sub(r"[^\w\s-]", "", text or "")
    text = re.sub(r"\s+", "_", text).strip("_")
    return (text[:max_len] or "video").lower()


def search_candidates(keyword: str, limit: int):
    """Call gallery-dl in metadata-only mode, return list of candidate pin dicts."""
    search_url = f"https://www.pinterest.com/search/pins/?q={quote(keyword)}&rs=typed"
    cmd = [
        str(Path(sys.executable).parent / "gallery-dl"),
        "--no-download",
        "--dump-json",
        "--range", f"1-{limit}",
        search_url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if result.returncode != 0 and not result.stdout.strip():
        print(result.stderr, file=sys.stderr)
        raise SystemExit(f"gallery-dl failed (exit {result.returncode})")
    try:
        entries = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise SystemExit(f"Could not parse gallery-dl output: {e}")

    candidates = []
    for entry in entries:
        if not isinstance(entry, list) or len(entry) < 3:
            continue
        _type, url, meta = entry[0], entry[1], entry[2]
        if not isinstance(meta, dict) or meta.get("extension") != "mp4":
            continue
        candidates.append({"url": url, "meta": meta})
    return candidates


def passes_reels_filter(meta: dict) -> bool:
    w, h = meta.get("width") or 0, meta.get("height") or 0
    dur = meta.get("duration") or 0
    if w <= 0 or h <= 0:
        return False
    aspect = w / h
    if not (MIN_ASPECT <= aspect <= MAX_ASPECT):
        return False
    if not (MIN_DURATION_MS <= dur <= MAX_DURATION_MS):
        return False
    return True


def download_one(url: str, dest: Path) -> bool:
    """Download a single pin video via yt-dlp. Strips gallery-dl's 'ytdl:' prefix."""
    if url.startswith("ytdl:"):
        url = url[len("ytdl:"):]

    # yt-dlp determines final extension; use %(ext)s to let it decide, then rename.
    ydl_opts = {
        "outtmpl": str(dest.with_suffix("")) + ".%(ext)s",
        "format": "bestvideo*+bestaudio/best",
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "retries": 5,
        "concurrent_fragment_downloads": 4,
        "overwrites": True,
    }
    try:
        with YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except Exception as e:
        print(f"  ! yt-dlp error: {e}", file=sys.stderr)
        return False

    # Locate whatever file yt-dlp produced and normalise to .mp4
    produced = next(dest.parent.glob(dest.stem + ".*"), None)
    if produced and produced.suffix.lower() != ".mp4":
        mp4 = produced.with_suffix(".mp4")
        produced.rename(mp4)
        produced = mp4
    return produced is not None and produced.exists()


def run(keyword: str, count: int, out_root: Path, strict_reels: bool = True) -> list[dict]:
    """Search Pinterest + download filtered videos.

    Returns list of dicts for each successfully saved video:
      {pin_id, keyword, title, local_path, source_url, width, height, duration_ms}
    """
    out_dir = out_root / safe_name(keyword)
    out_dir.mkdir(parents=True, exist_ok=True)

    scan_limit = max(MIN_SCAN, count * OVERSAMPLE_FACTOR)
    print(f"▶ Searching Pinterest: {keyword!r}  (scanning up to {scan_limit} pins)")
    candidates = search_candidates(keyword, scan_limit)
    print(f"  found {len(candidates)} video candidates")

    # Filter + dedupe on pin id
    seen, filtered = set(), []
    for c in candidates:
        pin_id = c["meta"].get("id")
        if not pin_id or pin_id in seen:
            continue
        if strict_reels and not passes_reels_filter(c["meta"]):
            continue
        seen.add(pin_id)
        filtered.append(c)
        if len(filtered) >= count:
            break

    if not filtered:
        print("No pins matched the filter. Try --no-filter or a different keyword.")
        return []

    print(f"  {len(filtered)} pass filter → downloading to {out_dir}\n")

    saved: list[dict] = []
    for i, c in enumerate(filtered, 1):
        meta = c["meta"]
        pin_id = meta.get("id")
        title = meta.get("grid_title") or meta.get("title") or pin_id
        fname = f"{pin_id}_{safe_name(title, 40)}.mp4"
        dest = out_dir / fname

        w, h, dur_ms = meta.get("width"), meta.get("height"), int(meta.get("duration") or 0)

        record = {
            "pin_id": pin_id,
            "keyword": keyword,
            "title": (meta.get("grid_title") or meta.get("title") or "").strip() or None,
            "local_path": str(dest),
            "source_url": c["url"][5:] if c["url"].startswith("ytdl:") else c["url"],
            "width": w,
            "height": h,
            "duration_ms": dur_ms,
        }

        if dest.exists() and dest.stat().st_size > 0:
            print(f"[{i}/{len(filtered)}] skip (exists): {fname}")
            saved.append(record)
            continue

        print(f"[{i}/{len(filtered)}] {w}x{h} {dur_ms/1000:.1f}s  {fname}")
        if download_one(c["url"], dest):
            saved.append(record)

    print(f"\nDone. {len(saved)} videos available.")
    print(f"Location: {out_dir}")
    return saved


def main():
    parser = argparse.ArgumentParser(
        description="Download Pinterest videos by keyword (Reels-friendly by default).",
    )
    parser.add_argument("keyword", help="Search keyword, e.g. 'interior design'")
    parser.add_argument("-n", "--count", type=int, default=10, help="Number of videos to download")
    parser.add_argument(
        "-o", "--output",
        default=str(Path.home() / "Downloads" / "pinterest"),
        help="Output root folder (a subfolder per keyword is created)",
    )
    parser.add_argument(
        "--no-filter", action="store_true",
        help="Disable 9:16 / <90s Reels filter",
    )
    args = parser.parse_args()

    run(
        keyword=args.keyword,
        count=args.count,
        out_root=Path(args.output).expanduser(),
        strict_reels=not args.no_filter,
    )


if __name__ == "__main__":
    main()
