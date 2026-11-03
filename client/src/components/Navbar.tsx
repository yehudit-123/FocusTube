/**
 * FocusTube Top Navigation Bar (RTL Hebrew)
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import { User } from '../types';
import { BookOpen, Video, Users, History, LogOut, User as UserIcon, Brain } from 'lucide-react';

interface NavbarProps {
  user: User;
  onLogout: () => void;
  onOpenProfile: () => void;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
    isActive
      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
  }`;

export const Navbar: React.FC<NavbarProps> = ({ user, onLogout, onOpenProfile }) => (
  <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between h-16">
        <NavLink to="/library" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xl font-bold bg-gradient-to-l from-indigo-400 to-violet-200 bg-clip-text text-transparent">
              FocusTube
            </span>
            <span className="hidden sm:inline-block text-xs text-slate-400 mr-2">
              מיקוד ולמידה
            </span>
          </div>
        </NavLink>

        <nav className="flex items-center gap-1 sm:gap-2">
          <NavLink to="/library" end className={navLinkClass}>
            <BookOpen className="w-4 h-4" />
            <span>ספרייה</span>
          </NavLink>
          <NavLink to="/my-videos" className={navLinkClass}>
            <Video className="w-4 h-4" />
            <span>הסרטונים שלי</span>
          </NavLink>
          <NavLink to="/classes" className={navLinkClass}>
            <Users className="w-4 h-4" />
            <span>כיתות</span>
          </NavLink>
          <NavLink to="/history" className={navLinkClass}>
            <History className="w-4 h-4" />
            <span>היסטוריה</span>
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors border border-slate-700/60"
            title="הגדרות פרופיל משתמש"
          >
            <UserIcon className="w-4 h-4 text-indigo-400" />
            <span className="max-w-[120px] truncate font-medium">
              {user.display_name || 'משתמש'}
            </span>
          </button>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-rose-300 hover:text-white hover:bg-rose-600/20 border border-rose-500/30 transition-colors"
            title="התנתק מהחשבון"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">התנתק</span>
          </button>
        </div>
      </div>
    </div>
  </header>
);
