"""Session models and schemas."""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class SessionReading(BaseModel):
    position_seconds: float
    score: float = Field(..., ge=0.0, le=1.0)
    raw_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    timestamp: datetime


class PauseEvent(BaseModel):
    timestamp: datetime
    position_seconds: float
    segment_index: Optional[int] = None
    question: Optional[str] = None
    selected_option_index: Optional[int] = None
    correct_option_index: Optional[int] = None
    is_correct: Optional[bool] = None
    action_taken: str  # "answered", "rewound", "continued", "no_face"


class CreateSessionRequest(BaseModel):
    content_id: str


class AddReadingRequest(BaseModel):
    position: float = Field(..., ge=0.0, description="Playback position in seconds")
    score: float = Field(..., ge=0.0, le=1.0, description="Smoothed score")
    raw_score: Optional[float] = Field(None, ge=0.0, le=1.0, description="Raw score")


class RecordPauseEventRequest(BaseModel):
    position_seconds: float
    segment_index: Optional[int] = None
    question: Optional[str] = None
    selected_option_index: Optional[int] = None
    correct_option_index: Optional[int] = None
    is_correct: Optional[bool] = None
    action_taken: str = "answered"


class EndSessionResponse(BaseModel):
    id: str
    reading_count: int
    average_score: float
    ended_at: datetime


class SessionResponse(BaseModel):
    id: str
    user_id: str
    content_id: str
    video_title: str = ""
    youtube_id: str = ""
    started_at: datetime
    ended_at: Optional[datetime] = None
    is_active: bool
    reading_count: int = 0
    average_score: float = 0.0
    readings: List[SessionReading] = []
    pause_events: List[PauseEvent] = []
