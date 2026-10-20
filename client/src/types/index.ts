/**
 * FocusTube Type Definitions
 */

export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface Question {
  question: string;
  options: [string, string, string, string];
  correct_index: number;
  explanation: string;
}

export interface VideoSegment {
  index: number;
  start_seconds: float;
  end_seconds: float;
  title: string;
  summary: string;
  text?: string;
  questions: Question[];
}

export interface Video {
  id: string;
  youtube_id: string;
  title: string;
  duration_seconds: number;
  categories: string[];
  segments: VideoSegment[];
  status: 'ready' | 'processing' | 'deleted' | 'questions_failed';
  failure_reason?: 'no_api_key' | 'invalid_api_key' | 'gemini_unavailable' | 'no_transcript' | 'invalid_ai_response' | null;
  processed_at?: string;
  created_at: string;
  last_retry_at?: string;
}

export interface ContentItem {
  id: string;
  user_id: string;
  video_id: string;
  video: Video;
  created_at: string;
  already_exists?: boolean;
}

export interface SessionReading {
  position_seconds: number;
  score: number;
  raw_score?: number;
  timestamp: string;
}

export interface PauseEvent {
  timestamp: string;
  position_seconds: number;
  segment_index?: number;
  question?: string;
  selected_option_index?: number;
  correct_option_index?: number;
  is_correct?: boolean;
  action_taken: 'answered' | 'rewound' | 'continued' | 'no_face';
}

export interface Session {
  id: string;
  user_id: string;
  content_id: string;
  video_title: string;
  youtube_id: string;
  started_at: string;
  ended_at?: string;
  is_active: boolean;
  reading_count: number;
  average_score: number;
  readings: SessionReading[];
  pause_events: PauseEvent[];
}

export interface StudentMetric {
  user_id: string;
  display_name: string;
  email: string;
  sessions_count: number;
  total_watch_time_seconds: number;
  average_concentration: number;
  pauses_count: number;
  correct_answers_count: number;
  wrong_answers_count: number;
  timeline_readings: Array<{
    position_seconds: number;
    score: number;
    timestamp?: string;
  }>;
}

export interface Classroom {
  id: string;
  owner_id: string;
  owner_name: string;
  name: string;
  category: string;
  role: 'student' | 'teacher';
  join_code: string;
  content_ids: string[];
  member_ids: string[];
  authorized_students: string[];
  created_at: string;
  metrics?: StudentMetric[];
}

type float = number;
