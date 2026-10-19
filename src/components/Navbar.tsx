/**
 * FocusTube Top Navigation Bar (RTL Hebrew)
 */

import React from 'react';
import { User } from '../types';
import { BookOpen, Video, Users, History, LogOut, User as UserIcon, Brain } from 'lucide-react';

export type NavTab = 'library' | 'my-videos' | 'classes' | 'history';

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  user: User | null;
  onLogout: () => void;
  onOpenProfile: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  user,
  onLogout,
  onOpenProfile,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onSelectTab('library')}>
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
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => onSelectTab('library')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                currentTab === 'library'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>ספרייה</span>
            </button>

            <button
              onClick={() => onSelectTab('my-videos')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                currentTab === 'my-videos'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>הסרטונים שלי</span>
            </button>

            <button
              onClick={() => onSelectTab('classes')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                currentTab === 'classes'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>כיתות</span>
            </button>

            <button
              onClick={() => onSelectTab('history')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                currentTab === 'history'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <History className="w-4 h-4" />
              <span>היסטוריה</span>
            </button>
          </nav>

          {/* User Profile & Logout */}
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors border border-slate-700/60"
              title="הגדרות פרופיל משתמש"
            >
              <UserIcon className="w-4 h-4 text-indigo-400" />
              <span className="max-w-[120px] truncate font-medium">
                {user?.display_name || 'משתמש'}
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
};
