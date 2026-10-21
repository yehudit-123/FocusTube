/**
 * FocusTube - "Students" tab of a class: members, and for the owner also join
 * requests to approve or decline, adding students by email and removing students.
 */

import React, { useState } from 'react';
import { Classroom } from '../../types';
import { Check, Clock, Crown, Mail, Plus, UserMinus, UserPlus, Users, X } from 'lucide-react';

interface ClassStudentsTabProps {
  classroom: Classroom;
  currentUserId: string;
  isBusy: boolean;
  onApproveRequest: (userId: string) => void;
  onDeclineRequest: (userId: string) => void;
  onRemoveMember: (userId: string) => void;
  onAddStudents: (emails: string[]) => Promise<boolean>;
  onCancelInvite: (email: string) => void;
}

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const Avatar: React.FC<{ name: string; tone?: 'indigo' | 'amber' | 'purple' }> = ({ name, tone = 'indigo' }) => {
  const tones = {
    indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  };
  return (
    <div className={`w-10 h-10 shrink-0 rounded-full border flex items-center justify-center text-sm font-bold ${tones[tone]}`}>
      {initials(name)}
    </div>
  );
};

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string; count?: number }> = ({ icon, title, count }) => (
  <div className="flex items-center gap-2 text-white font-bold">
    {icon}
    <span>{title}</span>
    {count !== undefined && <span className="text-xs font-medium text-slate-400">({count})</span>}
  </div>
);

export const ClassStudentsTab: React.FC<ClassStudentsTabProps> = ({
  classroom,
  currentUserId,
  isBusy,
  onApproveRequest,
  onDeclineRequest,
  onRemoveMember,
  onAddStudents,
  onCancelInvite,
}) => {
  const [emailsInput, setEmailsInput] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const isOwner = classroom.membership === 'owner';
  const isTeacherClass = classroom.role === 'teacher';
  const memberEmails = new Set(classroom.members.map((m) => m.email.toLowerCase()).filter(Boolean));
  const pendingInvites = classroom.authorized_students.filter((email) => !memberEmails.has(email.toLowerCase()));
  const studentsCount = classroom.members.filter((m) => !m.is_owner).length;

  const handleAddStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    const emails = emailsInput.split(/[,\n]/).map((email) => email.trim().toLowerCase()).filter(Boolean);
    if (emails.length === 0) return;
    if (await onAddStudents(emails)) setEmailsInput('');
  };

  return (
    <div className="space-y-6">
      {/* Join requests waiting for the teacher */}
      {isOwner && classroom.join_requests.length > 0 && (
        <section className="space-y-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/30">
          <SectionTitle icon={<Clock className="w-5 h-5 text-amber-400" />} title="בקשות הצטרפות ממתינות" count={classroom.join_requests.length} />
          <ul className="space-y-2">
            {classroom.join_requests.map((req) => (
              <li key={req.user_id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar name={req.display_name} tone="amber" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{req.display_name}</p>
                    <p className="text-xs text-slate-400 font-mono truncate" dir="ltr">{req.email}</p>
                    <p className="text-[11px] text-slate-500">ביקש/ה להצטרף ב־{formatDate(req.requested_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => onApproveRequest(req.user_id)}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    אישור
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeclineRequest(req.user_id)}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs font-medium disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    דחייה
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add students by email (teacher class owner) */}
      {isOwner && isTeacherClass && (
        <section className="space-y-3">
          <SectionTitle icon={<UserPlus className="w-5 h-5 text-indigo-400" />} title="הוספת תלמידים" />
          <form onSubmit={handleAddStudents} className="flex flex-col sm:flex-row gap-3">
            <textarea
              value={emailsInput}
              onChange={(e) => setEmailsInput(e.target.value)}
              rows={2}
              dir="ltr"
              placeholder="student1@school.edu, student2@school.edu"
              aria-label="כתובות דוא״ל של תלמידים"
              className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm text-left font-mono focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={isBusy || !emailsInput.trim()}
              className="self-start flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              הוסף תלמידים
            </button>
          </form>
          <p className="text-xs text-slate-400">
            תלמידים שהוספתם כאן מצטרפים מיד עם קוד הכיתה <strong className="font-mono text-indigo-300">{classroom.join_code}</strong>. תלמידים אחרים שיזינו את הקוד ישלחו בקשת הצטרפות לאישורכם.
          </p>
        </section>
      )}

      {/* Members */}
      <section className="space-y-3">
        <SectionTitle icon={<Users className="w-5 h-5 text-indigo-400" />} title="משתתפי הכיתה" count={classroom.member_count} />
        {studentsCount === 0 && (
          <p className="text-sm text-slate-400">עדיין אין תלמידים בכיתה. שתפו את קוד הכיתה כדי שתלמידים יוכלו להצטרף.</p>
        )}
        <ul className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden">
          {classroom.members.map((member) => (
            <li key={member.user_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={member.display_name} tone={member.is_owner ? 'purple' : 'indigo'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {member.display_name}
                  {member.user_id === currentUserId && <span className="text-xs font-normal text-slate-400"> (את/ה)</span>}
                </p>
                {member.email && <p className="text-xs text-slate-400 font-mono truncate" dir="ltr">{member.email}</p>}
              </div>
              {member.is_owner ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  <Crown className="w-3 h-3" />
                  {isTeacherClass ? 'מורה' : 'יוצר/ת הקבוצה'}
                </span>
              ) : isOwner && (
                confirmRemoveId === member.user_id ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-300">להסיר מהכיתה?</span>
                    <button
                      type="button"
                      onClick={() => { onRemoveMember(member.user_id); setConfirmRemoveId(null); }}
                      disabled={isBusy}
                      className="px-2.5 py-1 rounded-lg text-xs bg-rose-600 hover:bg-rose-500 text-white font-medium disabled:opacity-50"
                    >
                      הסר
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveId(null)}
                      className="px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-white"
                    >
                      ביטול
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveId(member.user_id)}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                    aria-label={`הסר את ${member.display_name} מהכיתה`}
                  >
                    <UserMinus className="w-4 h-4" />
                    <span className="hidden sm:inline">הסר</span>
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Invited by email but not joined yet */}
      {isOwner && pendingInvites.length > 0 && (
        <section className="space-y-3">
          <SectionTitle icon={<Mail className="w-5 h-5 text-slate-400" />} title="הוזמנו וטרם הצטרפו" count={pendingInvites.length} />
          <div className="flex flex-wrap gap-2">
            {pendingInvites.map((email) => (
              <span key={email} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono" dir="ltr">
                {email}
                <button
                  type="button"
                  onClick={() => onCancelInvite(email)}
                  disabled={isBusy}
                  className="p-0.5 rounded-full text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                  aria-label={`בטל את ההזמנה של ${email}`}
                  title="בטל הזמנה"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
