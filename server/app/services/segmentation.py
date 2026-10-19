"""Deterministic transcript segmentation service for FocusTube.
Segments transcript entries into 60-90s chunks based on sentence boundaries.
"""

from typing import List, Dict, Any
import re

SENTENCE_ENDINGS = ('.', '?', '!', '…', ':', '׃', '؛')


def ends_with_sentence_punctuation(text: str) -> bool:
    """Checks if text ends with sentence-ending punctuation, ignoring trailing whitespace or quotes."""
    stripped = text.strip().rstrip('"\'״׳')
    return stripped.endswith(SENTENCE_ENDINGS)


def segment_transcript(entries: List[Dict[str, Any]], total_duration_seconds: float = 0.0) -> List[Dict[str, Any]]:
    """Segments raw transcript entries into deterministic, non-overlapping segments.
    
    Each entry is expected to have:
      - 'text': str
      - 'start': float (seconds)
      - 'duration': float (seconds)
      
    Returns a list of segments with:
      - index: int (0-based)
      - start_seconds: float
      - end_seconds: float
      - text: str
    """
    if not entries:
        return []

    # Sort entries chronologically just in case
    sorted_entries = sorted(entries, key=lambda e: float(e.get("start", 0.0)))
    
    # Calculate total duration if not provided or 0
    last_entry = sorted_entries[-1]
    calculated_total = float(last_entry.get("start", 0.0)) + float(last_entry.get("duration", 0.0))
    if total_duration_seconds <= 0.0 or total_duration_seconds < calculated_total:
        total_duration_seconds = calculated_total

    # Very short video edge case: if total duration <= 60 seconds (or few entries), one single segment
    if total_duration_seconds <= 60.0:
        joined_text = " ".join(e.get("text", "").strip() for e in sorted_entries if e.get("text", "").strip())
        return [{
            "index": 0,
            "start_seconds": round(float(sorted_entries[0].get("start", 0.0)), 1),
            "end_seconds": round(float(total_duration_seconds), 1),
            "text": joined_text
        }]

    raw_segments = []
    current_entries: List[Dict[str, Any]] = []

    for i, entry in enumerate(sorted_entries):
        current_entries.append(entry)
        
        # Calculate current accumulated duration
        start_of_segment = float(current_entries[0].get("start", 0.0))
        # End of current entry
        end_of_current = float(entry.get("start", 0.0)) + float(entry.get("duration", 0.0))
        accumulated_duration = end_of_current - start_of_segment

        entry_text = entry.get("text", "").strip()
        accumulated_text = " ".join(e.get("text", "").strip() for e in current_entries)

        # Check closing conditions:
        # 1. At least 60s AND ends with sentence-ending punctuation
        # 2. Reached or exceeded 90s (hard cap condition, closes at boundary)
        is_closing = False
        if accumulated_duration >= 60.0 and ends_with_sentence_punctuation(entry_text):
            is_closing = True
        elif accumulated_duration >= 90.0:
            is_closing = True

        # If it's the last entry, close segment regardless
        if i == len(sorted_entries) - 1:
            is_closing = True

        if is_closing:
            raw_segments.append(list(current_entries))
            current_entries = []

    # If any trailing entries left, append to last raw segment or make a new one
    if current_entries:
        if raw_segments:
            raw_segments[-1].extend(current_entries)
        else:
            raw_segments.append(current_entries)

    # Post-process: Check if the final remainder segment is shorter than ~30 seconds.
    # If so, merge it into the previous segment.
    if len(raw_segments) > 1:
        last_seg_entries = raw_segments[-1]
        last_seg_start = float(last_seg_entries[0].get("start", 0.0))
        last_seg_end = float(last_seg_entries[-1].get("start", 0.0)) + float(last_seg_entries[-1].get("duration", 0.0))
        if (last_seg_end - last_seg_start) < 30.0:
            merged_last = raw_segments.pop()
            raw_segments[-1].extend(merged_last)

    # Build final segment objects with continuous boundaries:
    # end_seconds of segment k is start_seconds of segment k+1; for last segment, total_duration_seconds.
    final_segments: List[Dict[str, Any]] = []
    for idx, seg_entries in enumerate(raw_segments):
        start_sec = float(seg_entries[0].get("start", 0.0))
        
        if idx < len(raw_segments) - 1:
            next_start_sec = float(raw_segments[idx + 1][0].get("start", 0.0))
            end_sec = next_start_sec
        else:
            end_sec = total_duration_seconds

        # Ensure end_sec is strictly >= start_sec
        if end_sec < start_sec:
            end_sec = start_sec + sum(float(e.get("duration", 0.0)) for e in seg_entries)

        joined_text = " ".join(e.get("text", "").strip() for e in seg_entries if e.get("text", "").strip())
        
        final_segments.append({
            "index": idx,
            "start_seconds": round(start_sec, 1),
            "end_seconds": round(end_sec, 1),
            "text": joined_text
        })

    return final_segments


def format_segments_for_gemini(segments: List[Dict[str, Any]]) -> str:
    """Formats segments into the exact text structure expected by Gemini prompt:
    ### SEGMENT <index> | start=<start_seconds with one decimal>s | end=<end_seconds with one decimal>s
    <segment text>
    """
    blocks = []
    for seg in segments:
        header = f"### SEGMENT {seg['index']} | start={seg['start_seconds']:.1f}s | end={seg['end_seconds']:.1f}s"
        blocks.append(f"{header}\n{seg['text']}")
    return "\n\n".join(blocks)
