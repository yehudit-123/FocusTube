"""Video models and schemas."""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class QuestionModel(BaseModel):
    question: str
    options: List[str] = Field(..., min_items=4, max_items=4)
    correct_index: int = Field(..., ge=0, le=3)
    explanation: str


class VideoSegmentModel(BaseModel):
    index: int
    start_seconds: float
    end_seconds: float
    title: str = ""
    summary: str = ""
    text: str = ""
    questions: List[QuestionModel] = []


class VideoModel(BaseModel):
    id: str
    youtube_id: str
    title: str
    duration_seconds: float
    categories: List[str] = ["אחר"]
    segments: List[VideoSegmentModel] = []
    status: str = "processing"  # "ready" | "processing" | "questions_failed"
    failure_reason: Optional[str] = None  # "no_api_key" | "invalid_api_key" | "gemini_unavailable" | "no_transcript" | "invalid_ai_response"
    processed_at: Optional[datetime] = None
    created_at: datetime
    last_retry_at: Optional[datetime] = None


class VideoSummaryResponse(BaseModel):
    id: str
    youtube_id: str
    title: str
    duration_seconds: float
    categories: List[str]
    status: str
    failure_reason: Optional[str] = None
    created_at: datetime
