/**
 * FocusTube - Main Application Component
 */

import React, { useState, useEffect } from 'react';
import { User, ContentItem } from './types';
import { api, getStoredToken, getStoredUser, setStoredUser, removeStoredToken } from './services/api';
import { Navbar, NavTab } from './components/Navbar';
import { LoginView } from './views/LoginView';
import { RegisterView } from './views/RegisterView';
import { LibraryView } from './views/LibraryView';
import { MyVideosView } from './views/MyVideosView';
import { WatchView } from './views/WatchView';
import { HistoryView } from './views/HistoryView';
import { ClassesView } from './views/ClassesView';
import { ProfileModal } from './views/ProfileModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // App navigation tabs
  const [currentTab, setCurrentTab] = useState<NavTab>('library');
  const [watchingContentItem, setWatchingContentItem] = useState<ContentItem | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // 1. Initial auth check
  useEffect(() => {
    const initAuth = async () => {
      const token = getStoredToken();
      if (!token) {
        setIsAuthChecking(false);
        return;
      }

      try {
        const user = await api.getMe();
        setCurrentUser(user);
        setStoredUser(user);
      } catch (err) {
        // Token invalid or expired
        const fallback = getStoredUser();
        if (fallback) {
          setCurrentUser(fallback);
        } else {
          removeStoredToken();
          setCurrentUser(null);
        }
      } finally {
        setIsAuthChecking(false);
      }
    };

    initAuth();

    // Listen for unauthorized 401 events from api.ts
    const handleUnauthorized = () => {
      setCurrentUser(null);
      setWatchingContentItem(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch { }
    removeStoredToken();
    setCurrentUser(null);
    setWatchingContentItem(null);
    setAuthView('login');
  };

  const handleStartWatch = (item: ContentItem) => {
    setWatchingContentItem(item);
  };

  const handleEndWatch = () => {
    setWatchingContentItem(null);
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-5" role="status" aria-live="polite">
        <svg
  className="loading-eye text-white"
  viewBox="0 0 120 90"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  aria-hidden="true"
  stroke="currentColor"
  strokeWidth="4"
  strokeLinecap="round"
  strokeLinejoin="round"
>
  {/* עין פתוחה */}
  <g className="eye-open">
    <path d="M10 55C26 35 42 29 60 29s34 6 50 26C94 75 78 81 60 81S26 75 10 55Z" />
    <circle cx="60" cy="55" r="16" />
    <circle cx="60" cy="55" r="8" fill="currentColor" stroke="none" />
    <circle cx="65" cy="50" r="3" fill="#020617" stroke="none" />
    {/* ריסים כלפי מעלה */}
    <path d="M28 39L18 27M44 32L38 17M60 29V14M76 32L82 17M92 39L102 27" />
  </g>

  {/* עין עצומה */}
  <g className="eye-closed">
    <path d="M10 50C30 70 90 70 110 50" />
    {/* ריסים כלפי מטה */}
    <path d="M24 59L16 69M42 65L38 77M60 68V80M78 65L82 77M96 59L104 69" />
  </g>
</svg>
        <p className="text-sm">טוען את FocusTube...</p>
      </div>
    );
  }

  // If not logged in: show Login or Register view
  if (!currentUser) {
    if (authView === 'register') {
      return (
        <RegisterView
          onRegisterSuccess={(user) => setCurrentUser(user)}
          onNavigateToLogin={() => setAuthView('login')}
        />
      );
    }
    return (
      <LoginView
        onLoginSuccess={(user) => setCurrentUser(user)}
        onNavigateToRegister={() => setAuthView('register')}
      />
    );
  }

  // If in active watch session
  if (watchingContentItem) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            setWatchingContentItem(null);
            setCurrentTab(tab);
          }}
          user={currentUser}
          onLogout={handleLogout}
          onOpenProfile={() => setIsProfileModalOpen(true)}
        />
        <main className="flex-1">
          <WatchView
            contentItem={watchingContentItem}
            onSessionEnded={handleEndWatch}
          />
        </main>
      </div>
    );
  }

  // Main Dashboard View with Tabs
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setWatchingContentItem(null);
          setCurrentTab(tab);
        }}
        user={currentUser}
        onLogout={handleLogout}
        onOpenProfile={() => setIsProfileModalOpen(true)}
      />

      <main className="flex-1 pb-16">
        {currentTab === 'library' && (
          <LibraryView onWatchVideo={handleStartWatch} />
        )}

        {currentTab === 'my-videos' && (
          <MyVideosView onWatchVideo={handleStartWatch} />
        )}

        {currentTab === 'classes' && (
          <ClassesView currentUserId={currentUser.id} onWatchVideo={handleStartWatch} />
        )}

        {currentTab === 'history' && (
          <HistoryView />
        )}
      </main>

      {/* User Profile Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        user={currentUser}
        onClose={() => setIsProfileModalOpen(false)}
        onUserUpdated={(u) => setCurrentUser(u)}
        onAccountDeleted={() => {
          setIsProfileModalOpen(false);
          handleLogout();
        }}
      />
    </div>
  );
}
