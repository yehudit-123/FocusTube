"""Helper that loads a video, or a 'deleted' placeholder built from its tombstone."""

from datetime import datetime, timezone
from typing import Optional
from server.app.models.video import VideoModel


async def load_video_or_placeholder(db, video_id: str) -> Optional[VideoModel]:
    """Return the real video, or a placeholder with status 'deleted' if only a
    tombstone exists. Return None if neither exists (unknown/legacy id)."""
    video = await db.videos.find_one({"id": video_id})
    if video:
        return VideoModel(**video)

    tomb = await db.deleted_videos.find_one({"video_id": video_id})
    if not tomb:
        return None

    return VideoModel(
        id=video_id,
        youtube_id=tomb["youtube_id"],
        title=tomb.get("title", ""),
        duration_seconds=0.0,
        categories=["אחר"],
        segments=[],
        status="deleted",
        failure_reason=None,
        created_at=tomb.get("deleted_at", datetime.now(timezone.utc)),
    )