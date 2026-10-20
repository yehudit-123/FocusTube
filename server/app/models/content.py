"""Content models and schemas (User <-> Video link)."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from server.app.models.video import VideoModel, VideoSegmentModel


class AddContentRequest(BaseModel):
    url_or_id: str = Field(..., description="YouTube URL or video ID")


class ContentItemResponse(BaseModel):
    id: str
    user_id: str
    video_id: str
    video: VideoModel
    created_at: datetime
    already_exists: bool = False
