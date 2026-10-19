"""Authentication endpoints."""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, status, Response
from server.app.database import get_db
from server.app.models.user import RegisterRequest, LoginRequest, LoginResponse, UserResponse
from server.app.services.auth_service import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
async def register(req: RegisterRequest):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail={"message": "שירות מסד הנתונים אינו זמין"})

    email_clean = req.email.strip().lower()
    existing = await db.users.find_one({"email": email_clean})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "כתובת האימייל כבר קיימת במערכת"}
        )

    user_id = str(uuid.uuid4())
    hashed_pwd = hash_password(req.password)
    now = datetime.now(timezone.utc)

    user_doc = {
        "id": user_id,
        "email": email_clean,
        "password_hash": hashed_pwd,
        "display_name": req.display_name.strip(),
        "created_at": now
    }

    await db.users.insert_one(user_doc)

    return UserResponse(
        id=user_id,
        email=email_clean,
        display_name=req.display_name.strip(),
        created_at=now
    )


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail={"message": "שירות מסד הנתונים אינו זמין"})

    email_clean = req.email.strip().lower()
    user = await db.users.find_one({"email": email_clean})
    if not user or not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"message": "כתובת אימייל או סיסמה שגויים"}
        )

    token = create_access_token({"sub": user["id"], "email": email_clean})
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        expires_in=86400
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout():
    # Client drops the token. Stateless JWT logout.
    return Response(status_code=status.HTTP_204_NO_CONTENT)
