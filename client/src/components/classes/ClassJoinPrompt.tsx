/**
 * FocusTube - Shown instead of the class content to a user who is not a member yet:
 * invited by the teacher (join here), or waiting for the teacher to approve a request.
 */

import React, { useState } from 'react';
import { Classroom } from '../../types';
import { Clock, KeyRound, Loader2 } from 'lucide-react';

interface ClassJoinPromptProps {
  classroom: Classroom;
  isJoining: boolean;
  error: string | null;
  onJoin: (confirmedPrivacy: boolean) => void;
}

export const ClassJoinPrompt: React.FC<ClassJoinPromptProps> = ({ classroom, isJoining, error, onJoin }) => {
  const [confirmedPrivacy, setConfirmedPrivacy] = useState(false);
  const needsPrivacy = classroom.role === 'teacher';

  if (classroom.membership === 'pending') {
    return (
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 shadow-xl space-y-2">
        <div className="flex items-center gap-2 text-white font-bold text-lg">
          <Clock className="w-5 h-5 text-amber-400" />
          <span>בקשת ההצטרפות נשלחה</span>
        </div>
        <p className="text-sm text-slate-300">
          הבקשה שלך ממתינה לאישור המורה. לאחר האישור יופיעו כאן סרטוני הכיתה.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-xl space-y-4">
      <div className="flex items-center gap-2 text-white font-bold text-lg">
        <KeyRound className="w-5 h-5 text-indigo-400" />
        <span>הצטרפות לכיתה</span>
      </div>
      <p className="text-sm text-slate-300">
        {needsPrivacy
          ? 'המורה הוסיף/ה אותך לכיתה זו. כדי לצפות בסרטוני הכיתה יש להצטרף אליה ולאשר את הצגת נתוני הריכוז.'
          : 'הוזמנת לקבוצה זו. הצטרף/י כדי לצפות בסרטוני הקבוצה.'}
      </p>
      {needsPrivacy && (
        <label className="flex items-start gap-2.5 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmedPrivacy}
            onChange={(e) => setConfirmedPrivacy(e.target.checked)}
            className="mt-1"
          />
          <span>אני מאשר/ת שהמורה יראה נתוני ריכוז מצרפיים בלבד (ללא וידאו או נקודות פנים).</span>
        </label>
      )}
      <button
        type="button"
        onClick={() => onJoin(confirmedPrivacy)}
        disabled={isJoining || (needsPrivacy && !confirmedPrivacy)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
      >
        {isJoining && <Loader2 className="w-4 h-4 animate-spin" />}
        הצטרף לכיתה
      </button>
      {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
    </div>
  );
};
