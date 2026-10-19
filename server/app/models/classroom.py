"""Classroom models and schemas."""

from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime


class CreateClassRequest(BaseModel):
    name: str = Field(..., min_length=2)
    category: str = "אחר"
    role: str = Field(..., pattern="^(student|teacher)$")
    authorized_students: List[EmailStr] = []


class UpdateClassRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    authorized_students: Optional[List[EmailStr]] = None


class JoinClassRequest(BaseModel):
    join_code: str
    confirmed_privacy: bool = True


class AddVideoToClassRequest(BaseModel):
    content_id: str


class StudentMetric(BaseModel):
    user_id: str
    display_name: str
    email: str
    sessions_count: int
    total_watch_time_seconds: float
    average_concentration: float
    pauses_count: int
    correct_answers_count: int
    wrong_answers_count: int
    timeline_readings: List[dict] = []  # timestamp, score


class ClassResponse(BaseModel):
    id: str
    owner_id: str
    owner_name: str = ""
    name: str
    category: str
    role: str  # "student" | "teacher"
    join_code: str
    content_ids: List[str] = []
    member_ids: List[str] = []
    authorized_students: List[str] = []
    created_at: datetime
    metrics: Optional[List[StudentMetric]] = None
