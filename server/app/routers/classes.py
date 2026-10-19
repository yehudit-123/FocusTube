"""Classrooms endpoints for student study groups and teacher dashboards."""

import uuid
import secrets
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from server.app.database import get_db
from server.app.models.classroom import (
    CreateClassRequest,
    UpdateClassRequest,
    JoinClassRequest,
    AddVideoToClassRequest,
    ClassResponse,
    StudentMetric
)
from server.app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/classes", tags=["classes"])


def generate_join_code() -> str:
    """Generates an alphanumeric 6-character uppercase join code."""
    return secrets.token_hex(3).upper()


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ClassResponse)
async def create_class(
    req: CreateClassRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]
    now = datetime.now(timezone.utc)
    class_id = str(uuid.uuid4())
    join_code = generate_join_code()

    # Clean authorized emails if provided
    auth_emails = [e.strip().lower() for e in req.authorized_students if e.strip()]

    class_doc = {
        "id": class_id,
        "owner_id": user_id,
        "owner_name": current_user.get("display_name", "משתמש"),
        "name": req.name.strip(),
        "category": req.category,
        "role": req.role,  # "student" | "teacher"
        "join_code": join_code,
        "content_ids": [],
        "member_ids": [user_id],  # Owner is first member
        "authorized_students": auth_emails,
        "created_at": now
    }

    await db.classes.insert_one(class_doc)

    return ClassResponse(
        id=class_id,
        owner_id=user_id,
        owner_name=current_user.get("display_name", "משתמש"),
        name=req.name.strip(),
        category=req.category,
        role=req.role,
        join_code=join_code,
        content_ids=[],
        member_ids=[user_id],
        authorized_students=auth_emails,
        created_at=now,
        metrics=[]
    )


@router.get("", response_model=List[ClassResponse])
async def list_user_classes(current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = current_user["id"]
    user_email = current_user["email"].lower()

    # Classes where user is owner, or is in member_ids, or is an authorized student
    cursor = db.classes.find({
        "$or": [
            {"owner_id": user_id},
            {"member_ids": user_id},
            {"authorized_students": user_email}
        ]
    }).sort("created_at", -1)

    classes = await cursor.to_list(length=100)
    result = []
    for c in classes:
        result.append(ClassResponse(
            id=c["id"],
            owner_id=c["owner_id"],
            owner_name=c.get("owner_name", ""),
            name=c["name"],
            category=c.get("category", "אחר"),
            role=c.get("role", "student"),
            join_code=c.get("join_code", ""),
            content_ids=c.get("content_ids", []),
            member_ids=c.get("member_ids", []),
            authorized_students=c.get("authorized_students", []),
            created_at=c["created_at"],
            metrics=None
        ))
    return result


@router.post("/join", response_model=ClassResponse)
async def join_class(
    req: JoinClassRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]
    user_email = current_user["email"].lower()
    code_clean = req.join_code.strip().upper()

    class_doc = await db.classes.find_one({"join_code": code_clean})
    if not class_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "קוד הכיתה אינו קיים במערכת"}
        )

    # If teacher class with authorized students list, verify email is allowed
    is_teacher_class = class_doc.get("role") == "teacher"
    auth_list = class_doc.get("authorized_students", [])
    if is_teacher_class and auth_list:
        if user_email not in auth_list and user_id != class_doc["owner_id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": "אינך מורשה להצטרף לכיתה זו. רק תלמידים מורשים על ידי המורה יכולים להצטרף."}
            )

    # Privacy confirmation required for joining a teacher's class
    if is_teacher_class and not req.confirmed_privacy:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "נדרש אישור להצגת נתוני ריכוז מצרפיים למורה"}
        )

    # Add user to members if not already
    if user_id not in class_doc.get("member_ids", []):
        await db.classes.update_one(
            {"id": class_doc["id"]},
            {"$addToSet": {"member_ids": user_id}}
        )
        class_doc["member_ids"].append(user_id)

    return ClassResponse(
        id=class_doc["id"],
        owner_id=class_doc["owner_id"],
        owner_name=class_doc.get("owner_name", ""),
        name=class_doc["name"],
        category=class_doc.get("category", "אחר"),
        role=class_doc.get("role", "student"),
        join_code=class_doc.get("join_code", ""),
        content_ids=class_doc.get("content_ids", []),
        member_ids=class_doc.get("member_ids", []),
        authorized_students=class_doc.get("authorized_students", []),
        created_at=class_doc["created_at"]
    )


@router.get("/{class_id}", response_model=ClassResponse)
async def get_class_details(
    class_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]
    user_email = current_user["email"].lower()

    class_doc = await db.classes.find_one({"id": class_id})
    if not class_doc:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    # Check permission: user must be owner, member, or authorized student
    is_owner = class_doc["owner_id"] == user_id
    is_member = user_id in class_doc.get("member_ids", [])
    is_auth = user_email in class_doc.get("authorized_students", [])

    if not (is_owner or is_member or is_auth):
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    metrics = None
    # If teacher class and user is owner: generate student tracking metrics
    if class_doc.get("role") == "teacher" and is_owner:
        metrics = []
        member_ids = [m for m in class_doc.get("member_ids", []) if m != user_id]
        for mem_id in member_ids:
            student = await db.users.find_one({"id": mem_id})
            if not student:
                continue

            # Query student's sessions for videos in this class (or all student's sessions if empty)
            class_content_ids = class_doc.get("content_ids", [])
            query = {"user_id": mem_id}
            if class_content_ids:
                query["content_id"] = {"$in": class_content_ids}

            sessions = await db.sessions.find(query).to_list(length=100)
            
            sessions_count = len(sessions)
            total_score_sum = sum(s.get("average_score", 0.0) for s in sessions)
            avg_conc = round(total_score_sum / sessions_count, 2) if sessions_count > 0 else 0.0

            pauses_count = 0
            correct_count = 0
            wrong_count = 0
            timeline = []

            for s in sessions:
                pauses = s.get("pause_events", [])
                pauses_count += len(pauses)
                for p in pauses:
                    if p.get("is_correct") is True:
                        correct_count += 1
                    elif p.get("is_correct") is False:
                        wrong_count += 1

                for r in s.get("readings", [])[-20:]:  # Take sample
                    timeline.append({
                        "position_seconds": r.get("position_seconds", 0.0),
                        "score": r.get("score", 0.0),
                        "timestamp": r.get("timestamp")
                    })

            metrics.append(StudentMetric(
                user_id=mem_id,
                display_name=student.get("display_name", "תלמיד"),
                email=student.get("email", ""),
                sessions_count=sessions_count,
                total_watch_time_seconds=sum(s.get("reading_count", 0) * 2.5 for s in sessions),
                average_concentration=avg_conc,
                pauses_count=pauses_count,
                correct_answers_count=correct_count,
                wrong_answers_count=wrong_count,
                timeline_readings=timeline
            ))

    return ClassResponse(
        id=class_doc["id"],
        owner_id=class_doc["owner_id"],
        owner_name=class_doc.get("owner_name", ""),
        name=class_doc["name"],
        category=class_doc.get("category", "אחר"),
        role=class_doc.get("role", "student"),
        join_code=class_doc.get("join_code", ""),
        content_ids=class_doc.get("content_ids", []),
        member_ids=class_doc.get("member_ids", []),
        authorized_students=class_doc.get("authorized_students", []),
        created_at=class_doc["created_at"],
        metrics=metrics
    )


@router.patch("/{class_id}", response_model=ClassResponse)
async def update_class(
    class_id: str,
    req: UpdateClassRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    class_doc = await db.classes.find_one({"id": class_id, "owner_id": current_user["id"]})
    if not class_doc:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})
    if class_doc.get("role") != "teacher":
        raise HTTPException(status_code=400, detail={"message": "ניתן לנהל רשימת תלמידים רק בכיתת מורה"})

    updates = {}
    if req.authorized_students is not None:
        updates["authorized_students"] = sorted({
            email.strip().lower() for email in req.authorized_students if email.strip()
        })
    if req.name is not None:
        updates["name"] = req.name.strip()
    if req.category is not None:
        updates["category"] = req.category
    if updates:
        await db.classes.update_one({"id": class_id}, {"$set": updates})
        class_doc.update(updates)

    return ClassResponse(
        id=class_doc["id"],
        owner_id=class_doc["owner_id"],
        owner_name=class_doc.get("owner_name", ""),
        name=class_doc["name"],
        category=class_doc.get("category", "אחר"),
        role=class_doc.get("role", "student"),
        join_code=class_doc.get("join_code", ""),
        content_ids=class_doc.get("content_ids", []),
        member_ids=class_doc.get("member_ids", []),
        authorized_students=class_doc.get("authorized_students", []),
        created_at=class_doc["created_at"],
        metrics=None
    )


@router.post("/{class_id}/videos")
async def add_video_to_class(
    class_id: str,
    req: AddVideoToClassRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]

    class_doc = await db.classes.find_one({"id": class_id, "owner_id": user_id})
    if not class_doc:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    content_is_owned = await db.content.find_one({"id": req.content_id, "user_id": user_id})
    if not content_is_owned and req.content_id.startswith("lib-"):
        video_id = req.content_id.removeprefix("lib-")
        content_is_owned = await db.videos.find_one({"id": video_id})
    if not content_is_owned:
        raise HTTPException(status_code=404, detail={"message": "הסרטון לא נמצא בספרייה שלך"})

    await db.classes.update_one(
        {"id": class_id},
        {"$addToSet": {"content_ids": req.content_id}}
    )
    return {"message": "הסרטון נוסף לכיתה בהצלחה"}


@router.delete("/{class_id}/videos/{content_id}")
async def remove_video_from_class(
    class_id: str,
    content_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]

    class_doc = await db.classes.find_one({"id": class_id, "owner_id": user_id})
    if not class_doc:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    await db.classes.update_one(
        {"id": class_id},
        {"$pull": {"content_ids": content_id}}
    )
    return {"message": "הסרטון הוסר מהכיתה"}


@router.delete("/{class_id}")
async def delete_class(
    class_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]

    class_doc = await db.classes.find_one({"id": class_id, "owner_id": user_id})
    if not class_doc:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    await db.classes.delete_one({"id": class_id})
    return {"message": "הכיתה נמחקה בהצלחה"}
