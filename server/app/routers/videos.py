"""Video processing and retry endpoints."""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from server.app.database import get_db
from server.app.models.video import VideoModel
from server.app.services.auth_service import get_current_user
from server.app.services.video_processor import process_video_background

router = APIRouter(prefix="/api/videos", tags=["videos"])


@router.post("/{video_id}/retry", response_model=VideoModel)
async def retry_video_processing(
    video_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail={"message": "שירות מסד הנתונים אינו זמין"})

    video = await db.videos.find_one({"id": video_id})
    if not video:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    # Check cooldown of ~60 seconds
    now = datetime.now(timezone.utc)
    last_retry = video.get("last_retry_at")
    if last_retry:
        # Normalize timezone
        if last_retry.tzinfo is None:
            last_retry = last_retry.replace(tzinfo=timezone.utc)
        time_since_retry = (now - last_retry).total_seconds()
        if time_since_retry < 60:
            remaining = int(60 - time_since_retry)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"message": f"ניתן לנסות שוב בעוד {remaining} שניות"}
            )

    # Atomically switch status from 'questions_failed' to 'processing'
    res = await db.videos.find_one_and_update(
        {"id": video_id, "status": "questions_failed"},
        {"$set": {
            "status": "processing",
            "last_retry_at": now
        }},
        return_document=True
    )

    if not res:
        # Either not found or not in 'questions_failed' status (e.g. concurrent retry or already ready)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "הסרטון כבר נמצא בעיבוד או שאינו במצב פגום"}
        )

    # Launch background processing
    background_tasks.add_task(process_video_background, video_id, res["youtube_id"])

    return VideoModel(**res)


@router.get("/{video_id}", response_model=VideoModel)
async def get_video(
    video_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    video = await db.videos.find_one({"id": video_id})
    if not video:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})
    return VideoModel(**video)

@router.delete("/{video_id}")
async def delete_failed_video(
    video_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Permanently delete a flawed video. Allowed only if the user is linked to
    the video AND its status is 'questions_failed'. A tombstone is kept."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail={"message": "שירות מסד הנתונים אינו זמין"})

    user_id = current_user["id"]

    # 1. The user must be linked to the video, otherwise 404 (no info leak).
    link = await db.content.find_one({"user_id": user_id, "video_id": video_id})
    if not link:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    video = await db.videos.find_one({"id": video_id})
    if not video:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    # 2. Atomic delete: the status is checked inside the query itself, so a
    #    'ready' or 'processing' video can never be deleted (even by a race).
    result = await db.videos.delete_one({"id": video_id, "status": "questions_failed"})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "ניתן למחוק רק סרטון פגום"}
        )

    # 3. Leave a tombstone so classes and other users can show "unavailable".
    await db.deleted_videos.update_one(
        {"youtube_id": video["youtube_id"]},
        {"$set": {
            "video_id": video_id,
            "youtube_id": video["youtube_id"],
            "title": video.get("title", ""),
            "deleted_by": user_id,
            "deleted_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    # 4. Remove the deleter's own link. Classes reference the video by
    #    "lib-<video_id>", which is resolved through the tombstone.
    await db.content.delete_one({"id": link["id"]})

    return {"message": "הסרטון נמחק מהמאגר"}