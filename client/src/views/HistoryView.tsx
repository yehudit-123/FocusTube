/**
 * FocusTube - History View (היסטוריית סשנים)
 */

import React, { useState, useEffect } from 'react';
import { Session } from '../types';
import { api } from '../services/api';
import { SessionChart } from '../components/SessionChart';
import {
  History,
  Calendar,
  Clock,
  TrendingUp,
  ChevronLeft,
  Loader2,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from 'lucide-react';

export const HistoryView: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getSessions();
      setSessions(data);
      if (data.length > 0) {
        loadSessionDetails(data[0].id);
      }
    } catch (err: any) {
      setError(err?.message || 'אירעה שגיאה בטעינת היסטוריית הסשנים');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSessionDetails = async (sessionId: string) => {
    setIsLoadingDetails(true);
    try {
      const details = await api.getSession(sessionId);
      setSelectedSession(details);
    } catch (err: any) {
      console.error('Error loading session details:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('he-IL', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-white">
          היסטוריית למידה וריכוז
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          מעקב אחר סשני צפייה, ניתוח גרף הריכוז לאורך זמן ובדיקת שאלות ההבנה שנענו
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm">טוען נתוני היסטוריה...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-3">
          <AlertCircle className="w-6 h-6 shrink-0" />
          <p>{error}</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center">
            <History className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-1">טרם בוצעו סשנים</h3>
            <p className="text-sm text-slate-400 max-w-md">
              ברגע שתתחיל לצפות בסרטון עם הפעלת סשן, תוצאות הריכוז והמענה על השאלות יישמרו ויוצגו כאן.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sessions List (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
              כל הסשנים ({sessions.length})
            </h3>

            <div className="space-y-2.5 max-h-[650px] overflow-y-auto pr-1">
              {sessions.map((s) => {
                const isSelected = selectedSession?.id === s.id;
                return (
                  <div
                    key={s.id}
                    onClick={() => loadSessionDetails(s.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-indigo-600/15 border-indigo-500/60 shadow-lg shadow-indigo-600/10'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700/80'
                    }`}
                  >
                    <div>
                      <h4 className="font-bold text-white text-sm line-clamp-1 mb-1">
                        {s.video_title || 'סרטון למידה'}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(s.started_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-xs text-slate-300 font-mono">
                          ציון ממוצע:{' '}
                          <strong className="text-white">
                            {(s.average_score || 0).toFixed(2)}
                          </strong>
                        </span>
                      </div>

                      <ChevronLeft
                        className={`w-4 h-4 transition-transform ${
                          isSelected ? 'text-indigo-400 -translate-x-1' : 'text-slate-500'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Session Detail (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {isLoadingDetails ? (
              <div className="h-96 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-3xl">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              </div>
            ) : selectedSession ? (
              <div className="space-y-6">
                {/* Session Header Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-semibold uppercase text-indigo-400 tracking-wider">
                        פרטי סשן למידה
                      </span>
                      <h2 className="text-xl sm:text-2xl font-bold text-white">
                        {selectedSession.video_title}
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                        <span className="block text-[10px] text-slate-400">ציון ריכוז ממוצע</span>
                        <span className="text-lg font-black font-mono text-emerald-400">
                          {(selectedSession.average_score || 0).toFixed(2)}
                        </span>
                      </div>

                      <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                        <span className="block text-[10px] text-slate-400">מדידות שנשמרו</span>
                        <span className="text-lg font-black font-mono text-indigo-400">
                          {selectedSession.reading_count || selectedSession.readings?.length || 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Concentration Chart */}
                  <div className="pt-2">
                    <h3 className="text-xs font-semibold text-slate-400 mb-2">
                      גרף רמת הריכוז לאורך זמן הצפייה
                    </h3>
                    <SessionChart
                      readings={selectedSession.readings || []}
                      pauseEvents={selectedSession.pause_events || []}
                      threshold={0.6}
                    />
                  </div>
                </div>

                {/* Pause Events & Question Answers */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-indigo-400" />
                    <span>אירועי עצירה ושאלות הבנה ({selectedSession.pause_events?.length || 0})</span>
                  </h3>

                  {!selectedSession.pause_events || selectedSession.pause_events.length === 0 ? (
                    <p className="text-sm text-slate-400 py-3">
                      בסשן זה לא היו עצירות ריכוז – כל הכבוד על המיקוד הרציף!
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selectedSession.pause_events.map((pe, idx) => {
                        const m = Math.floor(pe.position_seconds / 60);
                        const s = Math.floor(pe.position_seconds % 60);
                        const timeStr = `${m}:${s < 10 ? '0' : ''}${s}`;

                        return (
                          <div
                            key={idx}
                            className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="px-2.5 py-0.5 rounded-full font-mono bg-slate-800 text-indigo-300">
                                זמן בסרטון: {timeStr}
                              </span>

                              {pe.is_correct === true ? (
                                <span className="flex items-center gap-1 font-bold text-emerald-400">
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>נענה נכון</span>
                                </span>
                              ) : pe.is_correct === false ? (
                                <span className="flex items-center gap-1 font-bold text-rose-400">
                                  <XCircle className="w-4 h-4" />
                                  <span>תשובה שגויה</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium">
                                  {pe.action_taken === 'rewound' ? 'נבחרה חזרה לאחור' : 'המשך צפייה'}
                                </span>
                              )}
                            </div>

                            {pe.question ? (
                              <p className="text-sm font-semibold text-white">
                                {pe.question}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-400">
                                עצירה עקב ירידה בריכוז (סרטון ללא שאלות מובנות)
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
