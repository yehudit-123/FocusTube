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
    ClassMember,
    JoinRequestInfo,
    StudentMetric
)
from server.app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/classes", tags=["classes"])


def generate_join_code() -> str:
    """Generates an alphanumeric 6-character uppercase join code."""
    return secrets.token_hex(3).upper()


async def _class_youtube_ids(db, content_ids: List[str]) -> List[str]:
    """Resolve a class's content ids (real content ids or lib-<video_id>) to youtube ids."""
    video_ids = []
    for content_id in content_ids:
        if content_id.startswith("lib-"):
            video_ids.append(content_id.removeprefix("lib-"))
        else:
            content = await db.content.find_one({"id": content_id})
            if content:
                video_ids.append(content["video_id"])

    youtube_ids = set()
    async for video in db.videos.find({"id": {"$in": video_ids}}):
        youtube_ids.add(video["youtube_id"])
    # A deleted video keeps its youtube_id in the tombstone, so old sessions still count.
    async for tomb in db.deleted_videos.find({"video_id": {"$in": video_ids}}):
        youtube_ids.add(tomb["youtube_id"])
    return list(youtube_ids)


def _membership(class_doc: dict, current_user: dict) -> str:
    """The current user's relation to the class."""
    user_id = current_user["id"]
    if class_doc["owner_id"] == user_id:
        return "owner"
    if user_id in class_doc.get("member_ids", []):
        return "member"
    if any(r["user_id"] == user_id for r in class_doc.get("join_requests", [])):
        return "pending"
    if current_user["email"].lower() in class_doc.get("authorized_students", []):
        return "invited"
    return "none"


async def _student_metrics(db, class_doc: dict) -> List[StudentMetric]:
    """Viewing statistics of every member except the owner, for the teacher dashboard."""
    metrics = []
    member_ids = [m for m in class_doc.get("member_ids", []) if m != class_doc["owner_id"]]

    # Class content ids are the teacher's ids, while a student's session holds the
    # student's own id (or lib-<video_id>), so match sessions by youtube_id instead.
    class_content_ids = class_doc.get("content_ids", [])
    class_youtube_ids = await _class_youtube_ids(db, class_content_ids)

    for mem_id in member_ids:
        student = await db.users.find_one({"id": mem_id})
        if not student:
            continue

        # Query student's sessions for videos in this class (or all student's sessions if empty)
        query = {"user_id": mem_id}
        if class_content_ids:
            query["youtube_id"] = {"$in": class_youtube_ids}

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
    return metrics


async def _class_response(db, class_doc: dict, current_user: dict, with_details: bool = False) -> ClassResponse:
    """Build the class as the current user may see it.

    Only the owner and members see the class content and member ids; the owner alone
    sees emails, the invited list and join requests. `with_details` adds the member
    list and, for the owner of a teacher class, the viewing statistics.
    """
    membership = _membership(class_doc, current_user)
    is_owner = membership == "owner"
    can_see_content = membership in ("owner", "member")
    member_ids = class_doc.get("member_ids", [])

    members: List[ClassMember] = []
    metrics: Optional[List[StudentMetric]] = None
    if with_details and can_see_content:
        users = {u["id"]: u async for u in db.users.find({"id": {"$in": member_ids}})}
        # Owner first, then members in the order they joined.
        ordered = [class_doc["owner_id"]] + [m for m in member_ids if m != class_doc["owner_id"]]
        for mem_id in ordered:
            user = users.get(mem_id)
            if not user:
                continue
            members.append(ClassMember(
                user_id=mem_id,
                display_name=user.get("display_name", "משתמש"),
                email=user.get("email", "") if is_owner or mem_id == current_user["id"] else "",
                is_owner=mem_id == class_doc["owner_id"],
            ))
        if is_owner and class_doc.get("role") == "teacher":
            metrics = await _student_metrics(db, class_doc)

    return ClassResponse(
        id=class_doc["id"],
        owner_id=class_doc["owner_id"],
        owner_name=class_doc.get("owner_name", ""),
        name=class_doc["name"],
        category=class_doc.get("category", "אחר"),
        role=class_doc.get("role", "student"),
        join_code=class_doc.get("join_code", ""),
        content_ids=class_doc.get("content_ids", []) if can_see_content else [],
        member_ids=member_ids if can_see_content else [],
        authorized_students=class_doc.get("authorized_students", []) if is_owner else [],
        created_at=class_doc["created_at"],
        membership=membership,
        member_count=len(member_ids),
        members=members,
        join_requests=[JoinRequestInfo(**r) for r in class_doc.get("join_requests", [])] if is_owner else [],
        metrics=metrics,
    )


async def _get_owned_class(db, class_id: str, user_id: str) -> dict:
    class_doc = await db.classes.find_one({"id": class_id, "owner_id": user_id})
    if not class_doc:
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})
    return class_doc


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ClassResponse)
async def create_class(
    req: CreateClassRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]
    now = datetime.now(timezone.utc)

    # Clean authorized emails if provided
    auth_emails = [e.strip().lower() for e in req.authorized_students if e.strip()]

    class_doc = {
        "id": str(uuid.uuid4()),
        "owner_id": user_id,
        "owner_name": current_user.get("display_name", "משתמש"),
        "name": req.name.strip(),
        "category": req.category,
        "role": req.role,  # "student" | "teacher"
        "join_code": generate_join_code(),
        "content_ids": [],
        "member_ids": [user_id],  # Owner is first member
        "authorized_students": auth_emails,
        "join_requests": [],
        "created_at": now
    }

    await db.classes.insert_one(class_doc)
    return await _class_response(db, class_doc, current_user, with_details=True)


@router.get("", response_model=List[ClassResponse])
async def list_user_classes(current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = current_user["id"]
    user_email = current_user["email"].lower()

    # Classes where user is owner, member, authorized student, or waiting for approval
    cursor = db.classes.find({
        "$or": [
            {"owner_id": user_id},
            {"member_ids": user_id},
            {"authorized_students": user_email},
            {"join_requests.user_id": user_id}
        ]
    }).sort("created_at", -1)

    classes = await cursor.to_list(length=100)
    return [await _class_response(db, c, current_user) for c in classes]


@router.post("/join", response_model=ClassResponse)
async def join_class(
    req: JoinClassRequest,
    current_user: dict = Depends(get_current_user)
):
    """Join by code. In a teacher class, a student the teacher already added by email
    joins right away; anyone else sends a join request the teacher approves or declines."""
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

    membership = _membership(class_doc, current_user)
    if membership in ("owner", "member", "pending"):
        return await _class_response(db, class_doc, current_user, with_details=True)

    is_teacher_class = class_doc.get("role") == "teacher"

    # Privacy confirmation required for joining a teacher's class
    if is_teacher_class and not req.confirmed_privacy:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "נדרש אישור להצגת נתוני ריכוז מצרפיים למורה"}
        )

    if is_teacher_class and membership != "invited":
        join_request = {
            "user_id": user_id,
            "display_name": current_user.get("display_name", "תלמיד"),
            "email": user_email,
            "requested_at": datetime.now(timezone.utc),
        }
        await db.classes.update_one({"id": class_doc["id"]}, {"$push": {"join_requests": join_request}})
        class_doc.setdefault("join_requests", []).append(join_request)
        return await _class_response(db, class_doc, current_user)

    await db.classes.update_one(
        {"id": class_doc["id"]},
        {"$addToSet": {"member_ids": user_id}}
    )
    class_doc["member_ids"].append(user_id)
    return await _class_response(db, class_doc, current_user, with_details=True)


@router.get("/{class_id}", response_model=ClassResponse)
async def get_class_details(
    class_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()

    class_doc = await db.classes.find_one({"id": class_id})
    if not class_doc or _membership(class_doc, current_user) == "none":
        raise HTTPException(status_code=404, detail={"message": "לא נמצא"})

    return await _class_response(db, class_doc, current_user, with_details=True)


@router.patch("/{class_id}", response_model=ClassResponse)
async def update_class(
    class_id: str,
    req: UpdateClassRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    class_doc = await _get_owned_class(db, class_id, current_user["id"])
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

    return await _class_response(db, class_doc, current_user, with_details=True)


@router.post("/{class_id}/requests/{user_id}/approve", response_model=ClassResponse)
async def approve_join_request(
    class_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    class_doc = await _get_owned_class(db, class_id, current_user["id"])
    if not any(r["user_id"] == user_id for r in class_doc.get("join_requests", [])):
        raise HTTPException(status_code=404, detail={"message": "הבקשה לא נמצאה"})

    await db.classes.update_one(
        {"id": class_id},
        {"$addToSet": {"member_ids": user_id}, "$pull": {"join_requests": {"user_id": user_id}}}
    )
    class_doc = await db.classes.find_one({"id": class_id})
    return await _class_response(db, class_doc, current_user, with_details=True)


@router.post("/{class_id}/requests/{user_id}/decline", response_model=ClassResponse)
async def decline_join_request(
    class_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    await _get_owned_class(db, class_id, current_user["id"])

    await db.classes.update_one({"id": class_id}, {"$pull": {"join_requests": {"user_id": user_id}}})
    class_doc = await db.classes.find_one({"id": class_id})
    return await _class_response(db, class_doc, current_user, with_details=True)


@router.delete("/{class_id}/members/{member_id}", response_model=ClassResponse)
async def remove_member(
    class_id: str,
    member_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove a student from the class. Their email is also taken off the invited list,
    otherwise the class would keep showing up for them as an invitation."""
    db = get_db()
    class_doc = await _get_owned_class(db, class_id, current_user["id"])
    if member_id == class_doc["owner_id"]:
        raise HTTPException(status_code=400, detail={"message": "לא ניתן להסיר את יוצר הכיתה"})
    if member_id not in class_doc.get("member_ids", []):
        raise HTTPException(status_code=404, detail={"message": "התלמיד אינו חבר בכיתה"})

    update = {"$pull": {"member_ids": member_id}}
    member = await db.users.find_one({"id": member_id})
    if member and member.get("email"):
        update["$pull"]["authorized_students"] = member["email"].lower()

    await db.classes.update_one({"id": class_id}, update)
    class_doc = await db.classes.find_one({"id": class_id})
    return await _class_response(db, class_doc, current_user, with_details=True)


@router.post("/{class_id}/videos")
async def add_video_to_class(
    class_id: str,
    req: AddVideoToClassRequest,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    user_id = current_user["id"]
    await _get_owned_class(db, class_id, user_id)

    content_doc = await db.content.find_one({"id": req.content_id, "user_id": user_id})
    if content_doc:
        video_id = content_doc["video_id"]
    elif req.content_id.startswith("lib-"):
        video_id = req.content_id.removeprefix("lib-")
    else:
        video_id = None

    video = await db.videos.find_one({"id": video_id}) if video_id else None
    if not video:
        raise HTTPException(status_code=404, detail={"message": "הסרטון לא נמצא בספרייה"})

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
    await _get_owned_class(db, class_id, current_user["id"])

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
    await _get_owned_class(db, class_id, current_user["id"])

    await db.classes.delete_one({"id": class_id})
    return {"message": "הכיתה נמחקה בהצלחה"}
