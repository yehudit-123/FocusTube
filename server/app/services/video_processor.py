"""Asynchronous video processor for FocusTube.
Coordinates transcript retrieval, segmentation, Gemini question generation, and database updates.
"""

import uuid
import logging
from datetime import datetime, timezone
from server.app.database import get_db
from server.app.services.youtube_service import fetch_video_metadata, fetch_youtube_transcript
from server.app.services.segmentation import segment_transcript, format_segments_for_gemini
from server.app.services.gemini_service import call_gemini_api

logger = logging.getLogger(__name__)


async def process_video_background(video_id: str, youtube_id: str):
    """Background task to fetch transcript, segment, and generate questions via Gemini."""
    db = get_db()
    if db is None:
        logger.error("DB connection not available for background processing")
        return

    try:
        # 1. Fetch metadata
        meta = await fetch_video_metadata(youtube_id)
        title = meta.get("title", f"YouTube Video ({youtube_id})")

        # 2. Fetch transcript
        entries, total_duration = fetch_youtube_transcript(youtube_id)
        if not entries or total_duration <= 0:
            logger.info(f"No transcript found for video {youtube_id}")
            await db.videos.update_one(
                {"id": video_id},
                {"$set": {
                    "title": title,
                    "status": "questions_failed",
                    "failure_reason": "no_transcript",
                    "categories": ["אחר"],
                    "processed_at": datetime.now(timezone.utc)
                }}
            )
            return

        # 3. Deterministic segmentation
        segments = segment_transcript(entries, total_duration)
        if not segments:
            await db.videos.update_one(
                {"id": video_id},
                {"$set": {
                    "title": title,
                    "status": "questions_failed",
                    "failure_reason": "no_transcript",
                    "categories": ["אחר"],
                    "processed_at": datetime.now(timezone.utc)
                }}
            )
            return

        formatted_text = format_segments_for_gemini(segments)

        # 4. Call Gemini
        ai_data, failure_reason = call_gemini_api(
            video_title=title,
            total_duration_seconds=total_duration,
            formatted_segments=formatted_text,
            expected_segment_count=len(segments)
        )

        if failure_reason or not ai_data:
            logger.warning(f"AI generation failed for video {video_id}: {failure_reason}")
            # Construct fallback segment representations without questions
            saved_segments = []
            for seg in segments:
                saved_segments.append({
                    "index": seg["index"],
                    "start_seconds": seg["start_seconds"],
                    "end_seconds": seg["end_seconds"],
                    "title": f"קטע {seg['index'] + 1}",
                    "summary": "",
                    "text": seg["text"],
                    "questions": []
                })

            await db.videos.update_one(
                {"id": video_id},
                {"$set": {
                    "title": title,
                    "duration_seconds": total_duration,
                    "segments": saved_segments,
                    "status": "questions_failed",
                    "failure_reason": failure_reason,
                    "categories": ["אחר"],
                    "processed_at": datetime.now(timezone.utc)
                }}
            )
            return

        # 5. Success! Merge server's own timestamps with Gemini's content
        ai_segments = ai_data.get("segments", [])
        final_segments = []
        for seg in segments:
            idx = seg["index"]
            ai_seg = ai_segments[idx] if idx < len(ai_segments) else {}
            final_segments.append({
                "index": idx,
                "start_seconds": seg["start_seconds"],  # Server authoritative
                "end_seconds": seg["end_seconds"],      # Server authoritative
                "title": ai_seg.get("title", f"קטע {idx + 1}"),
                "summary": ai_seg.get("summary", ""),
                "text": seg["text"],
                "questions": ai_seg.get("questions", [])
            })

        await db.videos.update_one(
            {"id": video_id},
            {"$set": {
                "title": title,
                "duration_seconds": total_duration,
                "categories": ai_data.get("categories", ["אחר"]),
                "segments": final_segments,
                "status": "ready",
                "failure_reason": None,
                "processed_at": datetime.now(timezone.utc)
            }}
        )
        logger.info(f"Video {video_id} ({youtube_id}) processed successfully with {len(final_segments)} segments.")

    except Exception as e:
        logger.error(f"Unexpected error in background processing for video {video_id}: {e}", exc_info=True)
        await db.videos.update_one(
            {"id": video_id},
            {"$set": {
                "status": "questions_failed",
                "failure_reason": "gemini_unavailable",
                "processed_at": datetime.now(timezone.utc)
            }}
        )
