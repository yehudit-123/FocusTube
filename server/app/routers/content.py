"""Content endpoints (User <-> Video links)."""

import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from server.app.database import get_db
from server.app.models.content import AddContentRequest, ContentItemResponse
from server.app.models.video import VideoModel
from server.app.services.auth_service import get_current_user
from server.app.services.youtube_service import extract_youtube_id, fetch_video_metadata
from server.app.services.video_processor import process_video_background
from server.app.services.video_lookup import load_video_or_placeholder

router = APIRouter(prefix="/api/content", tags=["content"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ContentItemResponse)
async def add_content(
    req: AddContentRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail={"message": "שירות מסד הנתונים אינו זמין"})

    youtube_id = extract_youtube_id(req.url_or_id)
    if not youtube_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "קישור או מזהה יוטיוב אינו תקין"}
        )

    user_id = current_user["id"]
    now = datetime.now(timezone.utc)

    # 1. Check global videos collection
    existing_video = await db.videos.find_one({"youtube_id": youtube_id})
    
    if existing_video:
        video_id = existing_video["id"]
        # Check if already linked to this user
        existing_content = await db.content.find_one({"user_id": user_id, "video_id": video_id})
        if not existing_content:
            content_id = str(uuid.uuid4())
            content_doc = {
                "id": content_id,
                "user_id": user_id,
                "video_id": video_id,
                "created_at": now
            }
            await db.content.insert_one(content_doc)
        else:
            content_id = existing_content["id"]

        # If it was processing, it will finish on its own. If ready or questions_failed, return as is.
        return ContentItemResponse(
            id=content_id,
            user_id=user_id,
            video_id=video_id,
            video=VideoModel(**existing_video),
            created_at=now,
            already_exists=True
        )

    # Video does not exist yet. If it was deleted before, reuse its old id so
    # every old reference (content links, classes, sessions) works again.
    tombstone = await db.deleted_videos.find_one({"youtube_id": youtube_id})
    video_id = tombstone["video_id"] if tombstone else str(uuid.uuid4())

    meta = await fetch_video_metadata(youtube_id)
    initial_title = meta.get("title", f"YouTube Video ({youtube_id})")

    video_doc = {
        "id": video_id,
        "youtube_id": youtube_id,
        "title": initial_title,
        "duration_seconds": 0.0,
        "categories": ["אחר"],
        "segments": [],
        "status": "processing",
        "failure_reason": None,
        "processed_at": None,
        "created_at": now,
        "last_retry_at": None
    }
    await db.videos.insert_one(video_doc)

    if tombstone:
        await db.deleted_videos.delete_one({"youtube_id": youtube_id})

    # The user may already have a link (the "unavailable" item): don't duplicate it.
    existing_link = await db.content.find_one({"user_id": user_id, "video_id": video_id})
    if existing_link:
        content_id = existing_link["id"]
    else:
        content_id = str(uuid.uuid4())
        await db.content.insert_one({
            "id": content_id,
            "user_id": user_id,
            "video_id": video_id,
            "created_at": now
        })

    # Launch background processing task
    background_tasks.add_task(process_video_background, video_id, youtube_id)

    return ContentItemResponse(
        id=content_id,
        user_id=user_id,
        video_id=video_id,
        video=VideoModel(**video_doc),
        created_at=now
    )


@router.get("", response_model=List[ContentItemResponse])
async def list_user_content(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    scope: Optional[str] = Query("mine", description="'mine' for user's videos, 'all' for library"),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]

    if scope == "all":
        # Library view: all available videos
        all_videos_cursor = db.videos.find({})
        all_videos = await all_videos_cursor.to_list(length=200)
        
        # Map user's existing content to associate content_id if exists
        user_contents = await db.content.find({"user_id": user_id}).to_list(length=500)
        video_to_content_id = {c["video_id"]: c["id"] for c in user_contents}

        items = []
        for v in all_videos:
            c_id = video_to_content_id.get(v["id"], f"lib-{v['id']}")
            items.append(ContentItemResponse(
                id=c_id,
                user_id=user_id,
                video_id=v["id"],
                video=VideoModel(**v),
                created_at=v.get("created_at", datetime.now(timezone.utc))
            ))
    else:
        # My Videos view: only user's uploaded videos
        content_cursor = db.content.find({"user_id": user_id}).sort("created_at", -1)
        user_contents = await content_cursor.to_list(length=200)

        items = []
        for c in user_contents:
            video_model = await load_video_or_placeholder(db, c["video_id"])
            if video_model:
                items.append(ContentItemResponse(
                    id=c["id"],
                    user_id=user_id,
                    video_id=c["video_id"],
                    video=video_model,
                    created_at=c["created_at"]
                ))

    # Apply search and category filtering in memory
    filtered = []
    for item in items:
        if search:
            query = search.strip().lower()
            title_match = query in item.video.title.lower()
            topic_match = any(query in cat.lower() for cat in item.video.categories)
            if not (title_match or topic_match):
                continue
        if category and category != "הכל":
            if category not in item.video.categories:
                continue
        filtered.append(item)

    return filtered


@router.get("/{content_id}", response_model=ContentItemResponse)
async def get_content_item(
    content_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]

    # Check if it's a library synthetic id (lib-<video_id>) or real content_id
    if content_id.startswith("lib-"):
        video_id = content_id.replace("lib-", "")
        video_model = await load_video_or_placeholder(db, video_id)
        if not video_model:
            raise HTTPException(status_code=404, detail={"message": "לא נמצא"})
        return ContentItemResponse(
            id=content_id,
            user_id=user_id,
            video_id=video_model.id,
            video=video_model,
            created_at=video_model.created_at
        )

    content = await db.content.find_one({"id": content_id})
    if not content or content["user_id"] != user_id:
        # Strict user isolation: 404 with generic "לא נמצא"
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    video_model = await load_video_or_placeholder(db, content["video_id"])
    if not video_model:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    return ContentItemResponse(
        id=content["id"],
        user_id=user_id,
        video_id=video_model.id,
        video=video_model,
        created_at=content["created_at"]
    )

@router.delete("/{content_id}", status_code=status.HTTP_200_OK)
async def delete_content_item(
    content_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]

    content = await db.content.find_one({"id": content_id})
    if not content or content["user_id"] != user_id:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    await db.content.delete_one({"id": content_id})
    return {"message": "הסרטון הוסר מהרשימה שלך בהצלחה"}
