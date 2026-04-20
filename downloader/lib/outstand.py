"""Minimal Outstand.so API client — ports the Instagram-relevant calls.

Mirrors the TypeScript client in ../socialMedia/reelGen/lib/outstand.ts.
Only the methods we need for: listing IG accounts, uploading a video, and
creating a post are ported.
"""

import os
from pathlib import Path
from typing import Any

import requests

DEFAULT_BASE_URL = "https://api.outstand.so/v1"


class OutstandError(RuntimeError):
    pass


def _base_url() -> str:
    return (os.environ.get("OUTSTAND_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")


def _api_key() -> str:
    key = (os.environ.get("OUTSTAND_API_KEY") or "").strip()
    if not key:
        raise OutstandError("OUTSTAND_API_KEY is not set — check .env")
    return key


def _headers(auth: bool = True, json_body: bool = False) -> dict[str, str]:
    h = {"Accept": "application/json"}
    if auth:
        h["Authorization"] = f"Bearer {_api_key()}"
    if json_body:
        h["Content-Type"] = "application/json"
    return h


def _unwrap(payload: Any) -> Any:
    """Outstand wraps responses as {success, data, ...}. Unwrap or raise."""
    if isinstance(payload, dict) and isinstance(payload.get("success"), bool):
        if not payload["success"]:
            raise OutstandError(payload.get("message") or payload.get("error") or "Outstand request failed")
        if "data" in payload:
            return payload["data"]
    return payload


def _request(method: str, path: str, *, auth: bool = True, query: dict | None = None, json: Any = None) -> Any:
    url = f"{_base_url()}/{path.lstrip('/')}"
    r = requests.request(
        method=method,
        url=url,
        headers=_headers(auth=auth, json_body=json is not None),
        params=query,
        json=json,
        timeout=60,
    )
    if not r.ok:
        raise OutstandError(f"Outstand {method} {path} → {r.status_code}: {r.text[:300]}")
    if not r.text:
        return {}
    try:
        return _unwrap(r.json())
    except ValueError:
        return {}


# ---------- accounts ----------

def list_social_accounts(limit: int = 100, offset: int = 0) -> list[dict]:
    payload = _request("GET", "/social-accounts", query={"limit": limit, "offset": offset})
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("accounts", "social_accounts", "items", "data"):
            val = payload.get(key)
            if isinstance(val, list):
                return val
    return []


def list_instagram_accounts() -> list[dict]:
    return [
        a for a in list_social_accounts()
        if str(a.get("network") or a.get("platform") or "").lower() == "instagram"
    ]


# ---------- media upload ----------

def _pick_filename(content_type: str, base: str) -> str:
    ct = (content_type or "").lower()
    if "quicktime" in ct:
        return f"{base}.mov"
    if "webm" in ct:
        return f"{base}.webm"
    return f"{base}.mp4"


def upload_local_video(local_path: Path, filename_base: str) -> dict:
    """Upload a local mp4 to Outstand. Returns {media_id, url, filename}."""
    local_path = Path(local_path)
    if not local_path.exists():
        raise OutstandError(f"video not found: {local_path}")

    content_type = "video/mp4"
    filename = _pick_filename(content_type, filename_base)

    # 1. Request upload URL
    create = _request(
        "POST", "/media/upload",
        json={"filename": filename, "content_type": content_type},
    )
    media_id = create.get("media_id") or create.get("mediaId") or create.get("id")
    upload_url = create.get("upload_url") or create.get("uploadUrl")
    if not media_id or not upload_url:
        raise OutstandError(f"Outstand upload URL missing: {create}")

    # 2. PUT the file bytes
    with open(local_path, "rb") as f:
        put = requests.put(
            upload_url,
            data=f,
            headers={"Content-Type": content_type},
            timeout=300,
        )
    if not put.ok:
        raise OutstandError(f"Outstand PUT failed ({put.status_code}): {put.text[:300]}")

    # 3. Confirm
    confirmed = _request("POST", f"/media/{media_id}/confirm")
    media = confirmed.get("media") if isinstance(confirmed, dict) and isinstance(confirmed.get("media"), dict) else confirmed
    media = media if isinstance(media, dict) else {}
    url = media.get("url") or create.get("url")
    if not url:
        raise OutstandError("Outstand confirm returned no media url")

    return {"media_id": media_id, "url": url, "filename": filename}


# ---------- posts ----------

def create_post(accounts: list[str], caption: str, media_url: str, filename: str) -> dict:
    payload = _request(
        "POST", "/posts/",
        json={
            "accounts": accounts,
            "content": caption,
            "containers": [
                {
                    "platform": "instagram",
                    "content": caption,
                    "media": [{"url": media_url, "filename": filename}],
                }
            ],
        },
    )
    post = payload.get("post") if isinstance(payload, dict) and isinstance(payload.get("post"), dict) else payload
    post = post if isinstance(post, dict) else {}
    post_id = post.get("id") or post.get("post_id") or post.get("postId")
    if not post_id:
        raise OutstandError(f"Outstand post id missing: {payload}")
    return {
        "post_id": post_id,
        "status": post.get("status") or post.get("state") or "submitted",
    }


def get_post_status(post_id: str) -> dict:
    payload = _request("GET", f"/posts/{post_id}/")
    post = payload.get("post") if isinstance(payload, dict) and isinstance(payload.get("post"), dict) else payload
    post = post if isinstance(post, dict) else {}
    return {
        "post_id": post.get("id") or post.get("post_id") or post_id,
        "status": post.get("status") or post.get("state"),
        "external_id": post.get("external_id") or post.get("externalId"),
        "error": post.get("error"),
    }
