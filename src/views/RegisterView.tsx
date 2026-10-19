/**
 * FocusTube - Register View (Hebrew RTL)
 */

import React, { useState } from 'react';
import { api, setStoredToken, setStoredUser } from '../services/api';
import { Brain, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { User } from '../types';

interface RegisterViewProps {
  onRegisterSuccess: (user: User) => void;
  onNavigateToLogin: () => void;
}

export const RegisterView: React.FC<RegisterViewProps> = ({
  onRegisterSuccess,
  onNavigateToLogin,
}) => {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !displayName.trim() || !password) {
      setErrorMessage('אנא מלא את כל השדות הנדרשים');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('על הסיסמה להכיל לפחות 8 תווים');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Register user
      const user = await api.register({
        email: email.trim(),
        display_name: displayName.trim(),
        password,
      });

      // 2. Automatically log in to get JWT token
      const authRes = await api.login({ email: email.trim(), password });
      setStoredToken(authRes.access_token);
      setStoredUser(user);

      onRegisterSuccess(user);
    } catch (err: any) {
      setErrorMessage(err?.message || 'אירעה שגיאה בהרשמה למערכת');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
      {/* Glow */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-md relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 mx-auto flex items-center justify-center shadow-xl shadow-indigo-600/25 mb-4 text-white">
            <Brain className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            יצירת חשבון ב-FocusTube
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            הצטרף לסביבת למידה חכמה ומדויקת
          </p>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2.5 p-3.5 mb-6 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              שם מלא או כינוי
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="ישראל ישראלי"
              required
              disabled={isLoading}
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              כתובת אימייל
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              disabled={isLoading}
              dir="ltr"
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-left"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              סיסמה (לפחות 8 תווים)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              disabled={isLoading}
              dir="ltr"
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-left"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-base transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-60 mt-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>יוצר חשבון...</span>
              </>
            ) : (
              <span>הרשם למערכת</span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-800/80 text-center">
          <p className="text-sm text-slate-400">
            כבר יש לך חשבון?{' '}
            <button
              onClick={onNavigateToLogin}
              className="text-indigo-400 hover:text-indigo-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <span>התחבר כאן</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
