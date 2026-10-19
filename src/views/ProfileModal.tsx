/**
 * FocusTube - User Profile Modal
 * Profile settings, name change, password update, and account deletion.
 */

import React, { useState } from 'react';
import { User } from '../types';
import { api, setStoredUser } from '../services/api';
import { X, User as UserIcon, Key, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onUserUpdated: (user: User) => void;
  onAccountDeleted: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  user,
  onClose,
  onUserUpdated,
  onAccountDeleted,
}) => {
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [isLoadingName, setIsLoadingName] = useState(false);
  const [isLoadingPwd, setIsLoadingPwd] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setIsLoadingName(true);
    setNameSuccess(null);
    setNameError(null);

    try {
      const updated = await api.updateMe({ display_name: displayName.trim() });
      setStoredUser(updated);
      onUserUpdated(updated);
      setNameSuccess('השם עודכן בהצלחה');
    } catch (err: any) {
      setNameError(err?.message || 'שגיאה בעדכון השם');
    } finally {
      setIsLoadingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;

    if (newPassword.length < 8) {
      setPwdError('סיסמה חדשה חייבת להכיל לפחות 8 תווים');
      return;
    }

    setIsLoadingPwd(true);
    setPwdSuccess(null);
    setPwdError(null);

    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      setPwdSuccess('הסיסמה שונתה בהצלחה');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPwdError(err?.message || 'שגיאה בשינוי הסיסמה');
    } finally {
      setIsLoadingPwd(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await api.deleteAccount();
      onAccountDeleted();
    } catch (err: any) {
      alert(err?.message || 'שגיאה במחיקת החשבון');
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative space-y-6 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <UserIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">הגדרות פרופיל אישי</h2>
            <p className="text-xs text-slate-400 font-mono">{user.email}</p>
          </div>
        </div>

        {/* 1. Update Display Name */}
        <form onSubmit={handleUpdateName} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white">עדכון שם מוצג</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={isLoadingName}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
            >
              {isLoadingName ? 'שומר...' : 'עדכן שם'}
            </button>
          </div>
          {nameSuccess && <p className="text-xs text-emerald-400">{nameSuccess}</p>}
          {nameError && <p className="text-xs text-rose-400">{nameError}</p>}
        </form>

        {/* 2. Change Password */}
        <form onSubmit={handleChangePassword} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Key className="w-4 h-4 text-indigo-400" />
            <span>שינוי סיסמה</span>
          </h3>
          <div className="space-y-2">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="סיסמה נוכחית"
              dir="ltr"
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm text-left focus:outline-none focus:border-indigo-500"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="סיסמה חדשה (לפחות 8 תווים)"
              dir="ltr"
              className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm text-left focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={isLoadingPwd}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-sm font-medium transition-colors"
          >
            {isLoadingPwd ? 'מעדכן סיסמה...' : 'החלף סיסמה'}
          </button>
          {pwdSuccess && <p className="text-xs text-emerald-400">{pwdSuccess}</p>}
          {pwdError && <p className="text-xs text-rose-400">{pwdError}</p>}
        </form>

        {/* 3. Delete Account with Confirmation */}
        <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-900/40 space-y-3">
          <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            <span>מחיקת חשבון לצמיתות</span>
          </h3>
          <p className="text-xs text-slate-400">
            פעולה זו תמחק לצמיתות את החשבון שלך ואת כל נתוני המדידה והסרטונים שלך.
          </p>

          {showConfirmDelete ? (
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold transition-colors"
              >
                {isDeleting ? 'מוחק חשבון...' : 'אני בטוח/ה, מחק את החשבון'}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmDelete(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition-colors"
              >
                ביטול
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowConfirmDelete(true)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-900/30 border border-rose-800/40 transition-colors"
            >
              מחק את החשבון שלי
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
