"""Session management endpoints for concentration tracking."""

import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from server.app.database import get_db
from server.app.models.session import (
    CreateSessionRequest,
    AddReadingRequest,
    RecordPauseEventRequest,
    EndSessionResponse,
    SessionResponse,
    SessionReading,
    PauseEvent
)
from server.app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=SessionResponse)
async def create_session(
    req: CreateSessionRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]

    # Verify content item belongs to user or is from library
    video_title = "שיעור וידאו"
    youtube_id = ""

    if req.content_id.startswith("lib-"):
        vid_id = req.content_id.replace("lib-", "")
        video = await db.videos.find_one({"id": vid_id})
        if video:
            video_title = video.get("title", video_title)
            youtube_id = video.get("youtube_id", "")
    else:
        content = await db.content.find_one({"id": req.content_id})
        if not content or content["user_id"] != user_id:
            raise HTTPException(status_code=404, detail={"message": "לא נמצא"})
        video = await db.videos.find_one({"id": content["video_id"]})
        if video:
            video_title = video.get("title", video_title)
            youtube_id = video.get("youtube_id", "")

    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    session_doc = {
        "id": session_id,
        "user_id": user_id,
        "content_id": req.content_id,
        "video_title": video_title,
        "youtube_id": youtube_id,
        "started_at": now,
        "ended_at": None,
        "is_active": True,
        "reading_count": 0,
        "average_score": 0.0,
        "total_score_sum": 0.0,
        "readings": [],
        "pause_events": []
    }

    await db.sessions.insert_one(session_doc)

    return SessionResponse(
        id=session_id,
        user_id=user_id,
        content_id=req.content_id,
        video_title=video_title,
        youtube_id=youtube_id,
        started_at=now,
        is_active=True,
        reading_count=0,
        average_score=0.0,
        readings=[],
        pause_events=[]
    )


@router.post("/{session_id}/readings")
async def add_reading(
    session_id: str,
    req: AddReadingRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]

    # Validate input bounds
    if req.position < 0.0 or not (0.0 <= req.score <= 1.0):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "ערכי המדידה אינם תקינים (ציון בין 0 ל-1, מיקום אי-שלילי)"}
        )

    session = await db.sessions.find_one({"id": session_id})
    if not session or session["user_id"] != user_id:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    if not session.get("is_active", False):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "הסשן כבר הסתיים, לא ניתן להוסיף מדידות נוספות"}
        )

    now = datetime.now(timezone.utc)
    reading_entry = {
        "position_seconds": round(req.position, 2),
        "score": round(req.score, 3),
        "raw_score": round(req.raw_score, 3) if req.raw_score is not None else None,
        "timestamp": now
    }

    new_count = session.get("reading_count", 0) + 1
    new_sum = session.get("total_score_sum", 0.0) + req.score
    new_avg = round(new_sum / new_count, 3)

    await db.sessions.update_one(
        {"id": session_id},
        {
            "$push": {"readings": reading_entry},
            "$set": {
                "reading_count": new_count,
                "total_score_sum": new_sum,
                "average_score": new_avg
            }
        }
    )

    return {"status": "ok", "average_score": new_avg, "reading_count": new_count}


@router.post("/{session_id}/pause")
async def record_pause_event(
    session_id: str,
    req: RecordPauseEventRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]

    session = await db.sessions.find_one({"id": session_id})
    if not session or session["user_id"] != user_id:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    event_entry = {
        "timestamp": datetime.now(timezone.utc),
        "position_seconds": req.position_seconds,
        "segment_index": req.segment_index,
        "question": req.question,
        "selected_option_index": req.selected_option_index,
        "correct_option_index": req.correct_option_index,
        "is_correct": req.is_correct,
        "action_taken": req.action_taken
    }

    await db.sessions.update_one(
        {"id": session_id},
        {"$push": {"pause_events": event_entry}}
    )

    return {"status": "ok"}


@router.post("/{session_id}/end", response_model=EndSessionResponse)
async def end_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]

    session = await db.sessions.find_one({"id": session_id})
    if not session or session["user_id"] != user_id:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    now = datetime.now(timezone.utc)
    reading_count = session.get("reading_count", 0)
    avg_score = session.get("average_score", 0.0)

    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {
            "is_active": False,
            "ended_at": now
        }}
    )

    return EndSessionResponse(
        id=session_id,
        reading_count=reading_count,
        average_score=avg_score,
        ended_at=now
    )


@router.get("", response_model=List[SessionResponse])
async def list_sessions(current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = current_user["id"]

    cursor = db.sessions.find({"user_id": user_id}).sort("started_at", -1)
    sessions = await cursor.to_list(length=100)

    res = []
    for s in sessions:
        res.append(SessionResponse(
            id=s["id"],
            user_id=s["user_id"],
            content_id=s["content_id"],
            video_title=s.get("video_title", "סרטון"),
            youtube_id=s.get("youtube_id", ""),
            started_at=s["started_at"],
            ended_at=s.get("ended_at"),
            is_active=s.get("is_active", False),
            reading_count=s.get("reading_count", 0),
            average_score=s.get("average_score", 0.0),
            readings=s.get("readings", []),
            pause_events=s.get("pause_events", [])
        ))
    return res


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]

    session = await db.sessions.find_one({"id": session_id})
    if not session or session["user_id"] != user_id:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    return SessionResponse(
        id=session["id"],
        user_id=session["user_id"],
        content_id=session["content_id"],
        video_title=session.get("video_title", "סרטון"),
        youtube_id=session.get("youtube_id", ""),
        started_at=session["started_at"],
        ended_at=session.get("ended_at"),
        is_active=session.get("is_active", False),
        reading_count=session.get("reading_count", 0),
        average_score=session.get("average_score", 0.0),
        readings=session.get("readings", []),
        pause_events=session.get("pause_events", [])
    )
