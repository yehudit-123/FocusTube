/**
 * FocusTube - Class header: name, subject, creator, member count and join code.
 */

import React, { useState } from 'react';
import { Classroom } from '../../types';
import { Check, Copy, GraduationCap, Users } from 'lucide-react';

interface ClassHeaderProps {
  classroom: Classroom;
}

export const ClassHeader: React.FC<ClassHeaderProps> = ({ classroom }) => {
  const [copied, setCopied] = useState(false);
  const isTeacherClass = classroom.role === 'teacher';

  const copyCode = () => {
    navigator.clipboard.writeText(classroom.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {classroom.category}
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                isTeacherClass
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {isTeacherClass ? 'כיתת מורה' : 'קבוצת תלמיד'}
            </span>
          </div>
          <h2 className="text-2xl font-black text-white break-words">{classroom.name}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
            <span className="flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-slate-500" />
              יוצר הכיתה: <span className="text-slate-200">{classroom.owner_name}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="text-slate-200 font-semibold">{classroom.member_count}</span> משתתפים בכיתה
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-2xl">
          <span className="text-xs text-slate-400">קוד שיתוף:</span>
          <span className="text-base font-black font-mono text-indigo-400">{classroom.join_code}</span>
          <button
            type="button"
            onClick={copyCode}
            className="p-1 hover:text-white text-slate-400 transition-colors"
            title="העתק קוד ללוח"
            aria-label="העתק את קוד הכיתה"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
