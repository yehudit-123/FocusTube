/**
 * FocusTube - Video Card Component
 */

import React, { useEffect, useState } from 'react';
import { Video, ContentItem } from '../types';
import { Play, RotateCw, Trash2, Clock, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { api, getHebrewFailureReason } from '../services/api';

interface VideoCardProps {
  contentItem: ContentItem;
  onWatch: (item: ContentItem) => void;
  onDelete?: (contentId: string) => void;
  onVideoUpdated?: (updatedVideo: Video) => void;
  showDelete?: boolean;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  contentItem,
  onWatch,
  onDelete,
  onVideoUpdated,
  showDelete = false,
}) => {
  const { video } = contentItem;
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  useEffect(() => {
    if (video.status !== 'processing') return;

    let active = true;
    let checking = false;
    const refreshStatus = async () => {
      if (checking) return;
      checking = true;
      try {
        const latestVideo = await api.getVideo(video.id);
        if (active && latestVideo.status !== 'processing') {
          setRetryMessage(null);
          onVideoUpdated?.(latestVideo);
        }
      } catch (err: any) {
        if (active) setRetryMessage(err?.message || 'לא ניתן לבדוק את מצב עיבוד הסרטון');
      } finally {
        checking = false;
      }
    };

    const intervalId = window.setInterval(refreshStatus, 3000);
    void refreshStatus();
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [video.id, video.status, onVideoUpdated]);

  useEffect(() => {
    if (video.status !== 'questions_failed') return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [video.status]);

  const retryTimestamp = video.last_retry_at ? Date.parse(video.last_retry_at) : NaN;
  const retryAvailableAt = cooldownUntil ?? (Number.isNaN(retryTimestamp) ? null : retryTimestamp + 60000);
  const retrySecondsRemaining = retryAvailableAt
    ? Math.max(0, Math.ceil((retryAvailableAt - now) / 1000))
    : 0;

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRetrying(true);
    setRetryMessage(null);

    try {
      const updated = await api.retryVideo(video.id);
      onVideoUpdated?.(updated);
      setCooldownUntil(null);
      setRetryMessage('העיבוד החוזר הופעל. בודק מחדש...');
    } catch (err: any) {
      const remainingMatch = String(err?.message || '').match(/בעוד\s+(\d+)\s+שניות/);
      if (remainingMatch) {
        const seconds = Number(remainingMatch[1]);
        setCooldownUntil(Date.now() + seconds * 1000);
      }
      setRetryMessage(err?.message || 'לא ניתן היה להפעיל עיבוד מחדש');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await api.deleteContent(contentItem.id);
      onDelete(contentItem.id);
    } catch (err: any) {
      alert(err?.message || 'שגיאה במחיקת הסרטון');
      setIsDeleting(false);
      setShowConfirmDelete(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700/80 transition-all flex flex-col group shadow-lg">
      {/* Thumbnail area */}
      <div className="relative aspect-video bg-slate-950 overflow-hidden cursor-pointer" onClick={() => onWatch(contentItem)}>
        <img
          src={`https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30" />

        {/* Play overlay button */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-14 h-14 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-xl shadow-indigo-600/40 backdrop-blur-sm transform scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-6 h-6 fill-current mr-0.5" />
          </div>
        </div>

        {/* Status Badges */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {video.status === 'ready' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/90 text-white shadow-md backdrop-blur-sm">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>מוכן עם שאלות</span>
            </span>
          )}

          {video.status === 'processing' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/90 text-white shadow-md backdrop-blur-sm animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>מעבד שאלות...</span>
            </span>
          )}

          {video.status === 'questions_failed' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-600 text-white shadow-md shadow-rose-600/30">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>פגום</span>
            </span>
          )}
        </div>

        {/* Duration badge */}
        {video.duration_seconds > 0 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/80 text-white text-xs font-mono">
            <Clock className="w-3 h-3 text-slate-300" />
            <span>{formatDuration(video.duration_seconds)}</span>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          {/* Categories */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {video.categories && video.categories.length > 0 ? (
              video.categories.map((cat, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-800 text-indigo-300 border border-indigo-900/40"
                >
                  {cat}
                </span>
              ))
            ) : (
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-800 text-slate-400">
                אחר
              </span>
            )}
          </div>

          {/* Title */}
          <h3
            className="text-base font-bold text-white line-clamp-2 hover:text-indigo-300 transition-colors cursor-pointer mb-2"
            onClick={() => onWatch(contentItem)}
            title={video.title}
          >
            {video.title}
          </h3>

          {/* Failure reason explanation if questions failed */}
          {video.status === 'questions_failed' && (
            <div className="mb-3 p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs">
              <p className="font-semibold mb-1">הסרטון נוסף ללא שאלות AI:</p>
              <p>{getHebrewFailureReason(video.failure_reason)}</p>
            </div>
          )}

          {retryMessage && (!retryMessage.includes('ניתן לנסות שוב בעוד') || retrySecondsRemaining > 0) && (
            <p className="text-xs text-indigo-300 mb-2">
              {retryMessage.includes('ניתן לנסות שוב בעוד')
                ? `ניתן לנסות שוב בעוד ${retrySecondsRemaining} שניות`
                : retryMessage}
            </p>
          )}
        </div>

        {/* Card Footer Actions */}
        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onWatch(contentItem)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all shadow-md shadow-indigo-600/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>צפה ולמד</span>
            </button>

            {video.status === 'questions_failed' && (
              <button
                onClick={handleRetry}
                disabled={isRetrying || retrySecondsRemaining > 0}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-amber-300 hover:text-white bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors disabled:opacity-50"
                title="נסה שוב ליצור שאלות באמצעות Gemini"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{retrySecondsRemaining > 0 ? `נסה שוב בעוד ${retrySecondsRemaining} שניות` : 'נסה שוב ליצור שאלות'}</span>
              </button>
            )}
          </div>

          {showDelete && (
            <div>
              {showConfirmDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="px-2 py-1 rounded text-xs bg-rose-600 text-white font-medium hover:bg-rose-500 transition-colors"
                  >
                    אישור
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowConfirmDelete(false);
                    }}
                    className="px-2 py-1 rounded text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    ביטול
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowConfirmDelete(true);
                  }}
                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                  title="הסר מהסרטונים שלי"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
