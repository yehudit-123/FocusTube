"""YouTube integration service.
Handles video ID extraction, oEmbed metadata retrieval, and transcript fetching.
"""

import re
import logging
from typing import Optional, List, Dict, Any, Tuple
import httpx
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)

logger = logging.getLogger(__name__)

YOUTUBE_REGEX = re.compile(
    r'(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})'
)

# YouTube uses "iw" for Hebrew; "he" is kept as a fallback.
HEBREW_CODES = ["iw", "he"]
ENGLISH_CODES = ["en", "en-US", "en-GB"]


def extract_youtube_id(url_or_id: str) -> Optional[str]:
    """Extracts an 11-character YouTube video ID from a URL or raw string."""
    cleaned = url_or_id.strip()
    if re.fullmatch(r'^[a-zA-Z0-9_-]{11}$', cleaned):
        return cleaned

    match = YOUTUBE_REGEX.search(cleaned)
    if match:
        return match.group(1)
    return None


async def fetch_video_metadata(youtube_id: str) -> Dict[str, Any]:
    """Fetches public video metadata via YouTube oEmbed API (no API key required)."""
    oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={youtube_id}&format=json"
    title = f"סרטון YouTube ({youtube_id})"
    author = "YouTube"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(oembed_url)
            if resp.status_code == 200:
                data = resp.json()
                title = data.get("title", title)
                author = data.get("author_name", author)
    except Exception as e:
        logger.warning(f"Failed to fetch oEmbed metadata for {youtube_id}: {e}")

    return {
        "youtube_id": youtube_id,
        "title": title,
        "author": author,
    }


def _pick_transcript(transcript_list):
    """Choose the best transcript: Hebrew manual, Hebrew generated,
    English manual, English generated, then any available."""
    attempts = [
        (transcript_list.find_manually_created_transcript, HEBREW_CODES),
        (transcript_list.find_generated_transcript, HEBREW_CODES),
        (transcript_list.find_manually_created_transcript, ENGLISH_CODES),
        (transcript_list.find_generated_transcript, ENGLISH_CODES),
    ]
    for finder, codes in attempts:
        try:
            return finder(codes)
        except NoTranscriptFound:
            continue

    # Fallback: first available transcript of any language
    for t in transcript_list:
        return t
    return None


def fetch_youtube_transcript(youtube_id: str) -> Tuple[Optional[List[Dict[str, Any]]], float]:
    """Fetches transcript entries with timestamps (youtube-transcript-api v1.x).
    Returns (entries, total_duration_seconds).
    Returns (None, 0.0) when no transcript exists. Other errors (network, blocking,
    code bugs) are logged with their real class name and re-raised so the caller
    can tell them apart from "no transcript".
    """
    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(youtube_id)

        transcript_obj = _pick_transcript(transcript_list)
        if transcript_obj is None:
            logger.info(f"No transcript available for {youtube_id}")
            return None, 0.0

        logger.info(
            f"Using transcript for {youtube_id}: "
            f"language={transcript_obj.language_code}, "
            f"generated={transcript_obj.is_generated}"
        )

        fetched = transcript_obj.fetch()
        raw_entries = list(fetched)  # v1.x: FetchedTranscriptSnippet objects
        if not raw_entries:
            return None, 0.0

        formatted_entries = []
        for entry in raw_entries:
            formatted_entries.append({
                "text": str(entry.text).replace("\n", " ").strip(),
                "start": float(entry.start),
                "duration": float(entry.duration),
            })

        last = formatted_entries[-1]
        total_duration = last["start"] + last["duration"]
        return formatted_entries, total_duration

    except (TranscriptsDisabled, NoTranscriptFound, VideoUnavailable) as e:
        logger.info(f"Transcript not available for {youtube_id}: {type(e).__name__}")
        return None, 0.0
    except Exception as e:
        logger.error(
            f"Transcript fetch failed for {youtube_id}: {type(e).__name__}: {e}"
        )
        raise