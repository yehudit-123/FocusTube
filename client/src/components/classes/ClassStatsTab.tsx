/**
 * FocusTube - "Viewing data" tab of a teacher class (owner only): per-student
 * concentration and viewing statistics, aggregated only.
 */

import React from 'react';
import { StudentMetric } from '../../types';
import { BarChart3, CheckCircle2, Clock, HelpCircle, TrendingUp, Users } from 'lucide-react';

interface ClassStatsTabProps {
  metrics: StudentMetric[];
}

const formatWatchTime = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} דק׳`;
  return `${Math.floor(minutes / 60)} ש׳ ${minutes % 60} דק׳`;
};

const concentrationTone = (score: number) =>
  score >= 0.75 ? 'text-emerald-400' : score >= 0.6 ? 'text-amber-400' : 'text-rose-400';

const Stat: React.FC<{ label: string; value: React.ReactNode; valueClass?: string }> = ({ label, value, valueClass = 'text-white' }) => (
  <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-center min-w-20">
    <span className="block text-[10px] text-slate-400">{label}</span>
    <span className={`text-sm font-black font-mono ${valueClass}`}>{value}</span>
  </div>
);

export const ClassStatsTab: React.FC<ClassStatsTabProps> = ({ metrics }) => {
  const active = metrics.filter((m) => m.sessions_count > 0);
  const totalSessions = metrics.reduce((sum, m) => sum + m.sessions_count, 0);
  const classAverage = active.length
    ? active.reduce((sum, m) => sum + m.average_concentration, 0) / active.length
    : 0;
  const totalWatch = metrics.reduce((sum, m) => sum + m.total_watch_time_seconds, 0);

  if (metrics.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-6 text-center">
        עדיין אין תלמידים בכיתה. כאשר תלמידים יצטרפו ויצפו בסרטונים, הנתונים יופיעו כאן אוטומטית.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <BarChart3 className="w-4 h-4 text-indigo-400" />
        מוצגים נתונים מצרפיים בלבד (ללא וידאו או נקודות פנים), עבור סרטוני הכיתה.
      </p>

      {/* Class summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Users, label: 'תלמידים שצפו', value: `${active.length} / ${metrics.length}` },
          { icon: TrendingUp, label: 'ריכוז ממוצע בכיתה', value: active.length ? classAverage.toFixed(2) : '—' },
          { icon: BarChart3, label: 'סה״כ סשנים', value: totalSessions },
          { icon: Clock, label: 'זמן צפייה כולל', value: formatWatchTime(totalWatch) },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Icon className="w-3.5 h-3.5 text-indigo-400" />
              {label}
            </div>
            <div className="text-lg font-black text-white font-mono">{value}</div>
          </div>
        ))}
      </div>

      {/* Per student */}
      <ul className="space-y-3">
        {metrics.map((m) => {
          const answered = m.correct_answers_count + m.wrong_answers_count;
          return (
            <li key={m.user_id} className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-bold text-white text-base truncate">{m.display_name}</h4>
                  <span className="text-xs text-slate-400 font-mono" dir="ltr">{m.email}</span>
                </div>

                {m.sessions_count === 0 ? (
                  <span className="text-xs text-slate-500">עדיין לא צפה/תה בסרטוני הכיתה</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Stat label="ריכוז ממוצע" value={m.average_concentration.toFixed(2)} valueClass={concentrationTone(m.average_concentration)} />
                    <Stat label="סשנים" value={m.sessions_count} />
                    <Stat label="זמן צפייה" value={formatWatchTime(m.total_watch_time_seconds)} />
                    <Stat label="עצירות" value={m.pauses_count} />
                    <Stat
                      label="תשובות נכונות"
                      value={answered ? `${m.correct_answers_count} / ${answered}` : '—'}
                      valueClass="text-indigo-400"
                    />
                  </div>
                )}
              </div>

              {m.sessions_count > 0 && answered > 0 && (
                <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {m.correct_answers_count} נכונות</span>
                  <span className="flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5 text-rose-400" /> {m.wrong_answers_count} שגויות</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
                    <div className="h-full bg-emerald-500" style={{ width: `${(m.correct_answers_count / answered) * 100}%` }} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
