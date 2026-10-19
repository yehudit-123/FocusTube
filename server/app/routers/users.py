"""User profile endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from server.app.database import get_db
from server.app.models.user import UserResponse, UpdateUserRequest, ChangePasswordRequest
from server.app.services.auth_service import get_current_user, hash_password, verify_password

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        display_name=current_user["display_name"],
        created_at=current_user["created_at"]
    )


@router.patch("/me", response_model=UserResponse)
async def update_my_profile(req: UpdateUserRequest, current_user: dict = Depends(get_current_user)):
    db = get_db()
    update_data = {}
    if req.display_name:
        update_data["display_name"] = req.display_name.strip()

    if update_data:
        await db.users.update_one({"id": current_user["id"]}, {"$set": update_data})
        current_user.update(update_data)

    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        display_name=current_user["display_name"],
        created_at=current_user["created_at"]
    )


@router.post("/me/change-password")
async def change_password(req: ChangePasswordRequest, current_user: dict = Depends(get_current_user)):
    db = get_db()
    if not verify_password(req.current_password, current_user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "הסיסמה הנוכחית שהוזנה אינה נכונה"}
        )

    new_hash = hash_password(req.new_password)
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"password_hash": new_hash}})
    return {"message": "הסיסמה שונתה בהצלחה"}


@router.delete("/me")
async def delete_my_account(current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = current_user["id"]
    
    # Delete user's data across collections
    await db.users.delete_one({"id": user_id})
    await db.content.delete_many({"user_id": user_id})
    await db.sessions.delete_many({"user_id": user_id})
    await db.classes.delete_many({"owner_id": user_id})
    await db.classes.update_many({}, {"$pull": {"member_ids": user_id}})

    return {"message": "החשבון וכל הנתונים המשויכים נמחקו לצמיתות"}
