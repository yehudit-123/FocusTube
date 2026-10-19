/**
 * FocusTube - Add YouTube Video Modal
 */

import React, { useState } from 'react';
import { api, getHebrewFailureReason } from '../services/api';
import { X, Youtube, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ContentItem } from '../types';

interface AddVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVideoAdded: (item: ContentItem) => void;
}

export const AddVideoModal: React.FC<AddVideoModalProps> = ({ isOpen, onClose, onVideoAdded }) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('אנא הזן קישור או מזהה סרטון יוטיוב');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessInfo(null);

    try {
      const res = await api.addContent(url.trim());
      
      if (res.video.status === 'questions_failed') {
        const reasonMsg = getHebrewFailureReason(res.video.failure_reason);
        setSuccessInfo(`הסרטון נוסף בהצלחה עם תווית "פגום": ${reasonMsg}`);
      } else {
        setSuccessInfo('הסרטון נוסף ונשלח לעיבוד שאלות הבנה באמצעות בינה מלאכותית.');
      }

      onVideoAdded(res);
      setTimeout(() => {
        setIsLoading(false);
        setUrl('');
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || 'אירעה שגיאה בהוספת הסרטון');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20">
            <Youtube className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">הוספת סרטון YouTube</h2>
            <p className="text-sm text-slate-400">הזן קישור לסרטון יוטיוב לניתוח תמלול ויצירת שאלות הבנה</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1.5">
              קישור לסרטון יוטיוב (YouTube URL)
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="לדוגמה: https://www.youtube.com/watch?v=... או youtu.be/..."
              disabled={isLoading}
              dir="ltr"
              className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-left"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successInfo && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{successInfo}</span>
            </div>
          )}

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">כיצד עובד העיבוד?</p>
            <p>1. המערכת מחלצת את תמלול הסרטון ומחלקת אותו למקטעים של 60–90 שניות.</p>
            <p>2. עבור כל מקטע מופקות 2 שאלות הבנה רב-ברירתיות.</p>
            <p>3. אם אין תמלול או שמפתח ה-AI אינו מוגדר, הסרטון נוסף עם תווית ״פגום״ ועדיין ניתן לצפות בו ולמדוד ריכוז.</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors text-sm font-medium"
            >
              ביטול
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>מעבד את הסרטון...</span>
                </>
              ) : (
                <span>הוסף סרטון</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
