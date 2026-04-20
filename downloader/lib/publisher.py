"""Publish a scheduled post row to Instagram via Outstand."""

from datetime import datetime, timezone
from pathlib import Path

from lib import db, outstand


def publish_post_row(post: dict) -> dict:
    """Given a joined row from db.due_posts / db.list_posts, push it live.

    Mutates the posts table: status, outstand_post_id, outstand_media_id, posted_at, error_message.
    """
    post_id = post["id"]
    local_path = Path(post["local_path"])
    caption = (post.get("caption") or "").strip()
    account_id = (post.get("outstand_account_id") or "").strip()

    if not caption:
        _fail(post_id, "no caption attached")
        raise RuntimeError(f"post {post_id}: no caption")
    if not account_id:
        _fail(post_id, "no outstand_account_id")
        raise RuntimeError(f"post {post_id}: no outstand_account_id")
    if not local_path.exists():
        _fail(post_id, f"video file missing: {local_path}")
        raise RuntimeError(f"post {post_id}: video file missing: {local_path}")

    db.update_post(post_id, status="publishing", error_message=None)

    try:
        media = outstand.upload_local_video(local_path, filename_base=f"interior-{post_id}")
        result = outstand.create_post(
            accounts=[account_id],
            caption=caption,
            media_url=media["url"],
            filename=media["filename"],
        )
    except Exception as e:
        _fail(post_id, str(e))
        raise

    db.update_post(
        post_id,
        status="posted",
        outstand_post_id=result["post_id"],
        outstand_media_id=media["media_id"],
        posted_at=datetime.now(timezone.utc).isoformat(),
        error_message=None,
    )
    db.mark_video_used(post["video_id"])

    return {"post_id": post_id, "outstand_post_id": result["post_id"], "status": result["status"]}


def _fail(post_id: int, msg: str) -> None:
    db.update_post(post_id, status="failed", error_message=msg[:500])
