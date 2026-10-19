"""Gemini integration service using the official Google GenAI Python SDK.
Handles prompt execution, schema enforcement, retry logic, and structured validation.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from google import genai
from google.genai import types

from server.app.config import settings
from server.app.prompts.gemini_prompts import (
    GEMINI_SYSTEM_PROMPT,
    GEMINI_USER_MESSAGE_TEMPLATE,
    ALLOWED_CATEGORIES
)

logger = logging.getLogger(__name__)


def validate_gemini_response(data: Any, expected_segment_count: int) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """Validates the returned JSON strictly according to FocusTube section 6 requirements.
    Returns (is_valid, error_code, cleaned_data).
    """
    if not isinstance(data, dict):
        return False, "invalid_ai_response", None

    status_val = data.get("status")
    if status_val == "insufficient_content":
        return False, "no_transcript", None

    if status_val != "ok":
        return False, "invalid_ai_response", None

    # Categories validation: 1-3 categories, all from ALLOWED_CATEGORIES
    raw_cats = data.get("categories", [])
    if not isinstance(raw_cats, list) or len(raw_cats) < 1 or len(raw_cats) > 3:
        return False, "invalid_ai_response", None

    valid_cats = []
    for c in raw_cats:
        c_str = str(c).strip()
        if c_str in ALLOWED_CATEGORIES:
            valid_cats.append(c_str)
        else:
            valid_cats.append("אחר")
    if not valid_cats:
        valid_cats = ["אחר"]

    # Segments validation
    segments = data.get("segments")
    if not isinstance(segments, list) or len(segments) != expected_segment_count:
        return False, "invalid_ai_response", None

    cleaned_segments = []
    for expected_idx in range(expected_segment_count):
        seg = segments[expected_idx]
        if not isinstance(seg, dict):
            return False, "invalid_ai_response", None

        # Check index matches expected_idx in order
        if seg.get("index") != expected_idx:
            return False, "invalid_ai_response", None

        title = str(seg.get("title", "")).strip() or f"קטע {expected_idx + 1}"
        summary = str(seg.get("summary", "")).strip()

        questions = seg.get("questions")
        if not isinstance(questions, list) or len(questions) != 2:
            return False, "invalid_ai_response", None

        cleaned_questions = []
        for q in questions:
            if not isinstance(q, dict):
                return False, "invalid_ai_response", None

            q_text = str(q.get("question", "")).strip()
            if not q_text:
                return False, "invalid_ai_response", None

            options = q.get("options")
            if not isinstance(options, list) or len(options) != 4:
                return False, "invalid_ai_response", None

            str_options = [str(opt).strip() for opt in options]
            # Must be non-empty and distinct
            if any(not opt for opt in str_options) or len(set(str_options)) != 4:
                return False, "invalid_ai_response", None

            correct_idx = q.get("correct_index")
            if not isinstance(correct_idx, int) or correct_idx < 0 or correct_idx > 3:
                return False, "invalid_ai_response", None

            explanation = str(q.get("explanation", "")).strip() or "תשובה זו מתבססת ישירות על הנאמר בקטע."

            cleaned_questions.append({
                "question": q_text,
                "options": str_options,
                "correct_index": correct_idx,
                "explanation": explanation
            })

        cleaned_segments.append({
            "index": expected_idx,
            "title": title,
            "summary": summary,
            "questions": cleaned_questions
        })

    return True, None, {
        "status": "ok",
        "language": str(data.get("language", "he")),
        "categories": valid_cats,
        "segments": cleaned_segments
    }


def call_gemini_api(video_title: str, total_duration_seconds: float, formatted_segments: str, expected_segment_count: int) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Calls Gemini with the official Google GenAI Python SDK.
    Handles missing keys, invalid keys, rate limits, schema retry, and errors gracefully.
    Returns (result_dict, failure_reason).
    """
    api_key = settings.gemini_api_key
    if not api_key:
        logger.warning("No GEMINI_API_KEY configured in environment.")
        return None, "no_api_key"

    user_message = GEMINI_USER_MESSAGE_TEMPLATE.format(
        video_title=video_title,
        total_duration_seconds=total_duration_seconds,
        formatted_segments=formatted_segments
    )

    # Attempt up to 2 times (retry once on validation or network failure)
    for attempt in range(2):
        try:
            client = genai.Client(api_key=api_key)
            
            response = client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=user_message,
                config=types.GenerateContentConfig(
                    system_instruction=GEMINI_SYSTEM_PROMPT,
                    temperature=0.3,
                    response_mime_type="application/json",
                )
            )

            if not response or not response.text:
                if attempt == 0:
                    continue
                return None, "invalid_ai_response"

            raw_text = response.text.strip()
            # Parse JSON
            try:
                data = json.loads(raw_text)
            except json.JSONDecodeError:
                # Try cleaning markdown code block if model included it despite prompt
                if raw_text.startswith("```"):
                    lines = raw_text.splitlines()
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    raw_text = "\n".join(lines).strip()
                try:
                    data = json.loads(raw_text)
                except json.JSONDecodeError:
                    logger.warning("Gemini returned malformed JSON on attempt %s", attempt + 1)
                    if attempt == 0:
                        continue
                    return None, "invalid_ai_response"

            is_valid, failure_code, cleaned_result = validate_gemini_response(data, expected_segment_count)
            if is_valid:
                return cleaned_result, None
            
            # If invalid, retry once
            logger.warning(f"Validation failed on attempt {attempt + 1}: {failure_code}")
            if attempt == 1:
                return None, failure_code

        except Exception as e:
            err_str = str(e).lower()
            logger.error(f"Error calling Gemini API on attempt {attempt + 1}: {e}")
            if any(marker in err_str for marker in (
                "api_key", "api key", "invalid api", "unauthorized", "unauthenticated", "permission_denied",
                "401", "403"
            )):
                return None, "invalid_api_key"
            if any(marker in err_str for marker in (
                "quota", "rate", "resource_exhausted", "429", "500", "502", "503", "504",
                "unavailable", "timeout", "timed out", "connection"
            )):
                if attempt == 0:
                    continue
                return None, "gemini_unavailable"
            
            if attempt == 1:
                return None, "gemini_unavailable"

    return None, "invalid_ai_response"
