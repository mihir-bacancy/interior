"""Upload downloaded mp4s to Cloudinary, then register in the Next.js app.

Used by cli.py after a successful download. Keeps the Python side stateless —
the Next.js app in the parent directory owns the DB.
"""

import os
from pathlib import Path
from typing import Any

import cloudinary
import cloudinary.uploader
import requests


def _configure_cloudinary():
    cloudinary.config(
        cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
        api_key=os.environ["CLOUDINARY_API_KEY"],
        api_secret=os.environ["CLOUDINARY_API_SECRET"],
        secure=True,
    )


def upload_to_cloudinary(local_path: Path, pin_id: str, keyword: str) -> dict[str, Any]:
    _configure_cloudinary()
    safe_keyword = "".join(c if c.isalnum() else "_" for c in keyword)[:40].lower()
    public_id = f"{safe_keyword}_{pin_id}"
    resp = cloudinary.uploader.upload(
        str(local_path),
        resource_type="video",
        folder="interior",
        public_id=public_id,
        overwrite=False,
    )
    return {
        "public_id": resp["public_id"],
        "url": resp["secure_url"],
        "duration_sec": resp.get("duration"),
        "width": resp.get("width"),
        "height": resp.get("height"),
        "bytes": resp.get("bytes"),
    }


def register_with_app(record: dict[str, Any], cloudinary_info: dict[str, Any]) -> dict[str, Any]:
    """POST to /api/videos/ingest. Returns the server's response body."""
    url = os.environ["APP_URL"].rstrip("/") + "/api/videos/ingest"
    secret = os.environ["INGEST_SECRET"]

    body = {
        "pin_id": record["pin_id"],
        "keyword": record["keyword"],
        "title": record.get("title"),
        "source_url": record.get("source_url"),
        "local_path": record.get("local_path"),
        "width": record.get("width"),
        "height": record.get("height"),
        "duration_ms": record.get("duration_ms"),
        "cloudinary_url": cloudinary_info["url"],
        "cloudinary_public_id": cloudinary_info["public_id"],
    }

    r = requests.post(
        url,
        json=body,
        headers={"x-ingest-secret": secret, "content-type": "application/json"},
        timeout=60,
    )
    if not r.ok:
        raise RuntimeError(f"ingest failed ({r.status_code}): {r.text[:300]}")
    return r.json()


def upload_and_register(record: dict[str, Any]) -> dict[str, Any]:
    """Full pipeline: mp4 file → Cloudinary → Next.js DB."""
    local_path = Path(record["local_path"])
    if not local_path.exists():
        raise FileNotFoundError(f"video not found: {local_path}")

    cloudinary_info = upload_to_cloudinary(local_path, record["pin_id"], record["keyword"])
    app_response = register_with_app(record, cloudinary_info)
    return {
        "cloudinary_public_id": cloudinary_info["public_id"],
        "cloudinary_url": cloudinary_info["url"],
        "video": app_response.get("video"),
        "deduped": app_response.get("deduped", False),
    }
