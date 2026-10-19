"""Unit tests for transcript segmentation algorithm.
Tests edge cases: no punctuation, very short video, gaps between entries, remainder merging.
"""

import unittest
import sys
import os

# Add server to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))

from server.app.services.segmentation import (
    segment_transcript,
    ends_with_sentence_punctuation,
    format_segments_for_gemini
)


class TestSegmentation(unittest.TestCase):
    def test_ends_with_sentence_punctuation(self):
        self.assertTrue(ends_with_sentence_punctuation("שלום לכולם."))
        self.assertTrue(ends_with_sentence_punctuation("מה שלומך?"))
        self.assertTrue(ends_with_sentence_punctuation("זה מדהים!"))
        self.assertTrue(ends_with_sentence_punctuation("נקודה בסוף..."))
        self.assertFalse(ends_with_sentence_punctuation("משפט ללא פיסוק"))
        self.assertTrue(ends_with_sentence_punctuation("Hello world."))
        self.assertTrue(ends_with_sentence_punctuation('ציטוט עם גרשיים."'))

    def test_very_short_video(self):
        entries = [
            {"text": "ברוכים הבאים לסרטון קצר.", "start": 0.0, "duration": 15.0},
            {"text": "זהו סרטון של חצי דקה בלבד.", "start": 15.0, "duration": 15.0}
        ]
        segments = segment_transcript(entries, total_duration_seconds=30.0)
        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0]["index"], 0)
        self.assertEqual(segments[0]["start_seconds"], 0.0)
        self.assertEqual(segments[0]["end_seconds"], 30.0)
        self.assertIn("ברוכים הבאים", segments[0]["text"])

    def test_standard_segmentation_with_sentence_endings(self):
        entries = [
            {"text": "היום נלמד על בינה מלאכותית.", "start": 0.0, "duration": 25.0},
            {"text": "נראה כיצד רשתות נוירונים פועלות", "start": 25.0, "duration": 20.0},
            {"text": "ומדוע הן כל כך פופולריות.", "start": 45.0, "duration": 20.0},
            {"text": "בחלק השני נדבר על למידה עמוקה.", "start": 65.0, "duration": 35.0},
            {"text": "נראה דוגמאות מודרניות רבות.", "start": 100.0, "duration": 35.0},
        ]
        segments = segment_transcript(entries, total_duration_seconds=135.0)
        self.assertEqual(len(segments), 2)
        self.assertEqual(segments[0]["index"], 0)
        self.assertEqual(segments[0]["start_seconds"], 0.0)
        self.assertEqual(segments[0]["end_seconds"], 65.0)
        self.assertEqual(segments[1]["index"], 1)
        self.assertEqual(segments[1]["start_seconds"], 65.0)
        self.assertEqual(segments[1]["end_seconds"], 135.0)

    def test_no_punctuation_hard_cap_boundary(self):
        entries = [
            {"text": "מילה ראשונה", "start": 0.0, "duration": 30.0},
            {"text": "מילה שנייה", "start": 30.0, "duration": 35.0},
            {"text": "מילה שלישית", "start": 65.0, "duration": 30.0},
            {"text": "מילה רביעית", "start": 95.0, "duration": 40.0},
            {"text": "מילה חמישית", "start": 135.0, "duration": 30.0},
        ]
        segments = segment_transcript(entries, total_duration_seconds=165.0)
        self.assertGreaterEqual(len(segments), 2)
        self.assertEqual(segments[0]["index"], 0)
        self.assertEqual(segments[0]["start_seconds"], 0.0)
        self.assertEqual(segments[0]["end_seconds"], 95.0)

    def test_merge_short_remainder(self):
        entries = [
            {"text": "הסבר מקיף וארוך על הנושא.", "start": 0.0, "duration": 40.0},
            {"text": "המשך ההסבר המלא והמפורט.", "start": 40.0, "duration": 40.0},
            {"text": "סיכום קצר ביותר של חמש עשרה שניות.", "start": 80.0, "duration": 15.0}
        ]
        segments = segment_transcript(entries, total_duration_seconds=95.0)
        self.assertEqual(len(segments), 1)
        self.assertEqual(segments[0]["end_seconds"], 95.0)
        self.assertIn("סיכום קצר ביותר", segments[0]["text"])

    def test_gaps_between_entries(self):
        entries = [
            {"text": "פתיח של הסרטון.", "start": 5.0, "duration": 30.0},
            {"text": "חזרה לדבר אחרי הפסקה מוזיקלית.", "start": 50.0, "duration": 35.0},
            {"text": "סיום הסרטון.", "start": 90.0, "duration": 40.0}
        ]
        segments = segment_transcript(entries, total_duration_seconds=130.0)
        self.assertGreaterEqual(len(segments), 1)
        for i in range(len(segments) - 1):
            self.assertEqual(segments[i]["end_seconds"], segments[i + 1]["start_seconds"])

    def test_formatting_for_gemini(self):
        segments = [
            {"index": 0, "start_seconds": 0.0, "end_seconds": 65.5, "text": "טקסט ראשון"},
            {"index": 1, "start_seconds": 65.5, "end_seconds": 130.0, "text": "טקסט שני"}
        ]
        formatted = format_segments_for_gemini(segments)
        self.assertIn("### SEGMENT 0 | start=0.0s | end=65.5s", formatted)
        self.assertIn("טקסט ראשון", formatted)
        self.assertIn("### SEGMENT 1 | start=65.5s | end=130.0s", formatted)
        self.assertIn("טקסט שני", formatted)


if __name__ == "__main__":
    unittest.main()
