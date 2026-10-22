/**
 * FocusTube - Watch Screen (Learning Session)
 * Integrates YouTube Player, MediaPipe webcam tracking, concentration score monitoring,
 * automatic pause on low attention (<0.6 for 2 evaluations), and comprehension questioning.
 */

import React, { useState, useEffect, useRef } from 'react';
import { ContentItem, Session, Question, VideoSegment } from '../types';
import { AttentionTracker, AttentionReading } from '../services/attentionTracker';
import { api } from '../services/api';
import { QuestionModal } from '../components/QuestionModal';
import {
  Play,
  Pause,
  Video as VideoIcon,
  VideoOff,
  Eye,
  EyeOff,
  Square,
  AlertCircle,
  CheckCircle2,
  Info,
  Clock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

interface WatchViewProps {
  contentItem: ContentItem;
  onSessionEnded: () => void;
}

export const WatchView: React.FC<WatchViewProps> = ({ contentItem, onSessionEnded }) => {
  const { video } = contentItem;
  const totalQuestions = video.segments?.reduce(
    (total, segment) => total + segment.questions.length,
    0
  ) ?? 0;

  // Session state
  const [session, setSession] = useState<Session | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasFace, setHasFace] = useState<boolean | null>(null);
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [rawScore, setRawScore] = useState<number | null>(null);
  const [warmupProgress, setWarmupProgress] = useState<number>(0);

  // Pause / Question state
  const [isPausedByTracker, setIsPausedByTracker] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [currentSegment, setCurrentSegment] = useState<VideoSegment | null>(null);
  const [isGenericFallback, setIsGenericFallback] = useState(false);
  const [answeredQuestionIds] = useState<Set<string>>(new Set());

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackerRef = useRef<AttentionTracker | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const lastPauseTimeRef = useRef<number>(0); // Cooldown of ~60s
  const lowScoreConsecutiveRef = useRef<number>(0); // Need 2 consecutive evaluations < 0.6
  const attentionReadingHandlerRef = useRef<(reading: AttentionReading) => void>(() => {});

  // 1. Initialize YouTube IFrame API
  useEffect(() => {
    let isMounted = true;

    const loadYT = () => {
      if (window.YT && window.YT.Player) {
        initPlayer();
      } else {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = () => {
          if (isMounted) initPlayer();
        };
      }
    };

    const initPlayer = () => {
      if (!isMounted) return;
      try {
        ytPlayerRef.current = new window.YT.Player('youtube-player', {
          videoId: video.youtube_id,
          playerVars: {
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            enablejsapi: 1,
          },
          events: {
            onReady: () => {
              console.log('[FocusTube] YouTube Player ready');
            },
          },
        });
      } catch (e) {
        console.warn('YouTube Player init error:', e);
      }
    };

    loadYT();

    return () => {
      isMounted = false;
      if (trackerRef.current) {
        trackerRef.current.stop();
      }
      if (ytPlayerRef.current && ytPlayerRef.current.destroy) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
      }
    };
  }, [video.youtube_id]);

  // 2. Start Session
  const handleStartSession = async () => {
    try {
      const newSession = await api.createSession(contentItem.id);
      setSession(newSession);
      setIsSessionActive(true);
      setQuestionNumber(0);

      // Play video
      if (ytPlayerRef.current && ytPlayerRef.current.playVideo) {
        ytPlayerRef.current.playVideo();
      }
    } catch (err: any) {
      alert(err?.message || 'שגיאה ביצירת סשן למידה');
      return;
    }

    // Turn the camera on automatically; the button stays as a retry if this fails.
    handleEnableCamera();
  };

  // 3. Enable Camera
  const handleEnableCamera = async () => {
    setCameraError(null);
    if (!videoRef.current) return;

    const tracker = new AttentionTracker();
    trackerRef.current = tracker;

    tracker.onFaceStatus = (detected) => {
      setHasFace(detected);
    };

    tracker.onBufferProgress = (pct) => {
      setWarmupProgress(pct);
    };

    tracker.onError = (msg) => {
      setCameraError(msg);
      setIsCameraEnabled(false);
    };

    // Go through the ref so readings see the latest session state, not the state
    // from the render that started the camera (it starts in the same click as the session).
    tracker.onReading = (reading: AttentionReading) => {
      attentionReadingHandlerRef.current(reading);
    };

    try {
      await tracker.startCamera(videoRef.current);
      setIsCameraEnabled(true);
    } catch (err: any) {
      setCameraError(err.message || 'שגיאה בגישה למצלמה');
      setIsCameraEnabled(false);
    }
  };

  // 4. Handle Attention Reading
  const handleAttentionReading = async (reading: AttentionReading) => {
    if (!reading.hasFace) {
      lowScoreConsecutiveRef.current = 0;
      return;
    }

    setCurrentScore(reading.score);
    setRawScore(reading.rawScore);

    // Get current playback time from YouTube Player
    let currentTime = 0;
    if (ytPlayerRef.current && ytPlayerRef.current.getCurrentTime) {
      try {
        currentTime = ytPlayerRef.current.getCurrentTime();
      } catch {}
    }

    // Save reading to backend
    if (session && isSessionActive) {
      api.addReading(session.id, {
        position: currentTime,
        score: reading.score,
        raw_score: reading.rawScore,
      }).catch(() => {});
    }

    // Check Pause Condition:
    // Low-concentration threshold: 0.6.
    // Must be below 0.6 for 2 consecutive evaluations.
    if (reading.score < 0.6) {
      lowScoreConsecutiveRef.current++;
    } else {
      lowScoreConsecutiveRef.current = 0;
    }

    // Cooldown check (~60 seconds since last pause)
    const nowMs = Date.now();
    const isCooldownActive = nowMs - lastPauseTimeRef.current < 60000;

    if (
      lowScoreConsecutiveRef.current >= 2 &&
      !isCooldownActive &&
      !isPausedByTracker &&
      isSessionActive
    ) {
      // Trigger automatic pause and comprehension question!
      lowScoreConsecutiveRef.current = 0;
      lastPauseTimeRef.current = nowMs;
      triggerPauseAndQuestion(currentTime, reading.dropTimeOffsetSeconds || 0);
    }
  };

  attentionReadingHandlerRef.current = handleAttentionReading;

  // 5. Trigger Pause and select segment question
  const triggerPauseAndQuestion = (currentPlaybackTime: number, dropOffsetSeconds: number) => {
    // 1. Pause video playback immediately
    if (ytPlayerRef.current && ytPlayerRef.current.pauseVideo) {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {}
    }

    setIsPausedByTracker(true);

    // Determine drop moment timestamp
    const dropTimestamp = Math.max(0, currentPlaybackTime - dropOffsetSeconds);

    // Check if video has questions (status === 'ready' and segments exist)
    if (video.status === 'questions_failed' || !video.segments || video.segments.length === 0) {
      // Behavior fallback for flawed videos
      setIsGenericFallback(true);
      setCurrentQuestion(null);
      setCurrentSegment(null);

      // Record pause event
      if (session) {
        api.recordPause(session.id, {
          position_seconds: currentPlaybackTime,
          action_taken: 'questions_failed_pause',
        }).catch(() => {});
      }
      return;
    }

    // Find segment whose [start_seconds, end_seconds] contains drop timestamp
    let targetSegment = video.segments.find(
      (s) => dropTimestamp >= s.start_seconds && dropTimestamp <= s.end_seconds
    );

    // If not found in exact range, fallback to segment closest to current time
    if (!targetSegment && video.segments.length > 0) {
      targetSegment = video.segments.reduce((prev, curr) => {
        return Math.abs(curr.start_seconds - dropTimestamp) < Math.abs(prev.start_seconds - dropTimestamp)
          ? curr
          : prev;
      });
    }

    if (!targetSegment || !targetSegment.questions || targetSegment.questions.length === 0) {
      setIsGenericFallback(true);
      setCurrentQuestion(null);
      setCurrentSegment(null);
      return;
    }

    // Choose randomly between its 2 questions, avoiding question already answered
    const available = targetSegment.questions.filter((q) => !answeredQuestionIds.has(q.question));
    const chosen = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : targetSegment.questions[Math.floor(Math.random() * targetSegment.questions.length)];

    answeredQuestionIds.add(chosen.question);

    setQuestionNumber((number) => number + 1);
    setIsGenericFallback(false);
    setCurrentSegment(targetSegment);
    setCurrentQuestion(chosen);

    // Record pause event
    if (session) {
      api.recordPause(session.id, {
        position_seconds: currentPlaybackTime,
        segment_index: targetSegment.index,
        question: chosen.question,
        action_taken: 'question_prompted',
      }).catch(() => {});
    }
  };

  // 6. Handle Answer selection
  const handleAnswerSelected = (selectedIndex: number, isCorrect: boolean) => {
    if (session && currentQuestion) {
      let currentTime = 0;
      if (ytPlayerRef.current && ytPlayerRef.current.getCurrentTime) {
        try {
          currentTime = ytPlayerRef.current.getCurrentTime();
        } catch {}
      }

      api.recordPause(session.id, {
        position_seconds: currentTime,
        segment_index: currentSegment?.index,
        question: currentQuestion.question,
        selected_option_index: selectedIndex,
        correct_option_index: currentQuestion.correct_index,
        is_correct: isCorrect,
        action_taken: isCorrect ? 'answered_correctly' : 'answered_incorrectly',
      }).catch(() => {});
    }
  };

  // 7. Rewind Action
  const handleRewind = () => {
    setIsPausedByTracker(false);
    setCurrentQuestion(null);

    let targetTime = 0;
    if (currentSegment) {
      targetTime = currentSegment.start_seconds;
    } else {
      // For generic fallback rewind ~30 seconds
      if (ytPlayerRef.current && ytPlayerRef.current.getCurrentTime) {
        try {
          targetTime = Math.max(0, ytPlayerRef.current.getCurrentTime() - 30);
        } catch {}
      }
    }

    if (ytPlayerRef.current) {
      if (ytPlayerRef.current.seekTo) ytPlayerRef.current.seekTo(targetTime, true);
      if (ytPlayerRef.current.playVideo) ytPlayerRef.current.playVideo();
    }
  };

  // 8. Continue Action
  const handleContinue = () => {
    setIsPausedByTracker(false);
    setCurrentQuestion(null);

    if (ytPlayerRef.current && ytPlayerRef.current.playVideo) {
      ytPlayerRef.current.playVideo();
    }
  };

  // 9. End Session
  const handleEndSession = async () => {
    if (trackerRef.current) {
      trackerRef.current.stop();
    }
    if (ytPlayerRef.current && ytPlayerRef.current.pauseVideo) {
      try {
        ytPlayerRef.current.pauseVideo();
      } catch {}
    }

    if (session) {
      try {
        await api.endSession(session.id);
      } catch {}
    }

    setIsSessionActive(false);
    onSessionEnded();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 animate-fade-in">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <button
            onClick={onSessionEnded}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-1.5 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>חזרה לספרייה</span>
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            {video.title}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {!isSessionActive ? (
            <button
              onClick={handleStartSession}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>התחל סשן</span>
            </button>
          ) : (
            <button
              onClick={handleEndSession}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium text-sm transition-all shadow-lg shadow-rose-600/30 cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>סיים סשן</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Viewport Grid: Video Player + Camera & Concentration Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: YouTube Video Player (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="relative aspect-video bg-black rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
            <div id="youtube-player" className="w-full h-full" />
          </div>

          {/* Video Metadata / Flawed notice */}
          {video.status === 'questions_failed' && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs sm:text-sm flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="font-bold">סרטון במצב ״פגום״ (ללא שאלות תוכן מובנות)</p>
                <p className="text-amber-300/80 mt-0.5">
                  מדידת הריכוז דרך המצלמה פועלת כרגיל. במידה ותזוהה ירידה בריכוז, הסרטון יעצור ותוצע לך חזרה של 30 שניות לאחור.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Camera & Live Concentration Monitor (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Concentration Meter Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                מדד קשב חי
              </span>
              {hasFace === true ? (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                  <Eye className="w-3.5 h-3.5" />
                  <span>פנים מזוהות</span>
                </span>
              ) : hasFace === false ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-rose-400 animate-pulse">
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>לא זוהו פנים</span>
                </span>
              ) : null}
            </div>

            {/* Prominent Score Display */}
            <div className="text-center py-2">
              <div className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-white">
                {currentScore !== null ? currentScore.toFixed(2) : '--'}
              </div>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                רמת ריכוז (0–1)
              </p>
            </div>

            {/* Score Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    currentScore === null
                      ? 'w-0'
                      : currentScore >= 0.7
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                      : currentScore >= 0.6
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                      : 'bg-gradient-to-r from-rose-600 to-red-500'
                  }`}
                  style={{ width: `${(currentScore || 0) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0.0 (הסחת דעת)</span>
                <span className="text-rose-400 font-bold">סף 0.6</span>
                <span>1.0 (מיקוד מלא)</span>
              </div>
            </div>

            {/* Initial buffer warmup */}
            {isCameraEnabled && warmupProgress < 100 && currentScore === null && (
              <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 text-center">
                <p>מכייל חלון מדידה ראשוני ({warmupProgress}%)...</p>
                <p className="text-[10px] text-slate-400 mt-0.5">ציון ראשון יופיע לאחר כ-10 שניות</p>
              </div>
            )}
          </div>

          {/* Camera Feed Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <VideoIcon className="w-4 h-4 text-indigo-400" />
                <span>מצלמת מעקב</span>
              </div>
            </div>

            {/* Video element for landmark processing */}
            <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover transform -scale-x-100 ${
                  isCameraEnabled ? 'block' : 'hidden'
                }`}
              />

              {!isCameraEnabled && (
                <div className="text-center p-4 space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-500 mx-auto flex items-center justify-center">
                    <VideoOff className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-slate-400">המצלמה כבויה</p>
                </div>
              )}

              {/* No face overlay */}
              {isCameraEnabled && hasFace === false && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 text-center">
                  <div className="space-y-1">
                    <EyeOff className="w-6 h-6 text-rose-400 mx-auto" />
                    <p className="text-xs font-bold text-rose-300">לא זוהו פנים</p>
                    <p className="text-[10px] text-slate-400">אנא שים לב שמצלמתך מכוונת לכיוונך</p>
                  </div>
                </div>
              )}
            </div>

            {/* Enable Camera Button with Mandatory Privacy Statement */}
            {!isCameraEnabled ? (
              <div className="space-y-3">
                <button
                  onClick={handleEnableCamera}
                  disabled={!isSessionActive}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs sm:text-sm transition-all shadow-md shadow-indigo-600/30 disabled:opacity-50 cursor-pointer"
                >
                  <VideoIcon className="w-4 h-4" />
                  <span>הפעל מצלמה למדידת ריכוז</span>
                </button>

                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2 leading-relaxed">
                  <Info className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
                  <span>
                    המצלמה משמשת למדידת ריכוז בלבד. הווידאו לא עוזב את הדפדפן ולא נשמר. נשלחים רק ציוני ריכוז.
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-emerald-400 text-center font-medium">
                המצלמה פעילה ומודדת ריכוז בזמן אמת (10 FPS)
              </p>
            )}

            {cameraError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{cameraError}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Question Modal on Concentration Drop */}
      <QuestionModal
        isOpen={isPausedByTracker}
        question={currentQuestion}
        questionNumber={questionNumber}
        totalQuestions={totalQuestions}
        segmentTitle={currentSegment?.title}
        isGenericFallback={isGenericFallback}
        onAnswerSelected={handleAnswerSelected}
        onRewind={handleRewind}
        onContinue={handleContinue}
      />
    </div>
  );
};
