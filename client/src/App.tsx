import React, { useEffect, useState } from 'react';
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { User, ContentItem } from './types';
import { api, getStoredToken, removeStoredToken, setStoredUser } from './services/api';
import { Navbar } from './components/Navbar';
import { LoginView } from './views/LoginView';
import { RegisterView } from './views/RegisterView';
import { LibraryView } from './views/LibraryView';
import { MyVideosView } from './views/MyVideosView';
import { WatchView } from './views/WatchView';
import { HistoryView } from './views/HistoryView';
import { ClassesView } from './views/ClassesView';
import { ProfileModal } from './views/ProfileModal';

interface AppProps {
  currentUser: User;
  onLogout: () => void;
  onUserUpdated: (user: User) => void;
  onAccountDeleted: () => void;
}

interface RouteState {
  from?: {
    pathname?: string;
  };
}

interface WatchRouteState {
  item?: ContentItem;
}

const getReturnPath = (state: unknown): string => {
  const path = (state as RouteState | null)?.from?.pathname;
  return path && path !== '/login' && path !== '/register' ? path : '/library';
};

const LoadingScreen = () => (
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
      <g className="eye-open">
        <path d="M10 55C26 35 42 29 60 29s34 6 50 26C94 75 78 81 60 81S26 75 10 55Z" />
        <circle cx="60" cy="55" r="16" />
        <circle cx="60" cy="55" r="8" fill="currentColor" stroke="none" />
        <circle cx="65" cy="50" r="3" fill="#020617" stroke="none" />
        <path d="M28 39L18 27M44 32L38 17M60 29V14M76 32L82 17M92 39L102 27" />
      </g>
      <g className="eye-closed">
        <path d="M10 50C30 70 90 70 110 50" />
        <path d="M24 59L16 69M42 65L38 77M60 68V80M78 65L82 77M96 59L104 69" />
      </g>
    </svg>
    <p className="text-sm">טוען את FocusTube...</p>
  </div>
);

function ProtectedRoute({ currentUser }: { currentUser: User | null }) {
  const location = useLocation();

  if (!currentUser || !getStoredToken()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

function AppLayout({ currentUser, onLogout, onUserUpdated, onAccountDeleted }: AppProps) {
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        user={currentUser}
        onLogout={onLogout}
        onOpenProfile={() => setIsProfileModalOpen(true)}
      />
      <main className="flex-1 pb-16">
        <Outlet />
      </main>
      <ProfileModal
        isOpen={isProfileModalOpen}
        user={currentUser}
        onClose={() => setIsProfileModalOpen(false)}
        onUserUpdated={onUserUpdated}
        onAccountDeleted={onAccountDeleted}
      />
    </div>
  );
}

function ClassesPage({ currentUser, onWatchVideo }: Pick<AppProps, 'currentUser'> & {
  onWatchVideo: (item: ContentItem) => void;
}) {
  return <ClassesView currentUserId={currentUser.id} onWatchVideo={onWatchVideo} />;
}

function WatchRoute() {
  const { contentId } = useParams<{ contentId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [contentItem, setContentItem] = useState<ContentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const routeItem = (location.state as WatchRouteState | null)?.item;

  useEffect(() => {
    let active = true;

    if (routeItem && routeItem.id === contentId) {
      setContentItem(routeItem);
      setError(null);
      return () => {
        active = false;
      };
    }

    setContentItem(null);
    setError(null);
    if (!contentId) {
      setError('לא צוין סרטון לצפייה');
      return () => {
        active = false;
      };
    }

    api.getContentItem(contentId)
      .then((item) => {
        if (active) setContentItem(item);
      })
      .catch((err: Error) => {
        if (active) setError(err.message || 'לא ניתן לטעון את הסרטון');
      });

    return () => {
      active = false;
    };
  }, [contentId, routeItem]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-5">
        <p role="alert" className="text-rose-300">{error}</p>
        <button
          onClick={() => navigate('/library')}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
        >
          חזרה לספרייה
        </button>
      </div>
    );
  }

  if (!contentItem) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400" role="status">
        טוען סרטון...
      </div>
    );
  }

  return <WatchView contentItem={contentItem} onSessionEnded={() => navigate('/library')} />;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let active = true;
    const initAuth = async () => {
      if (!getStoredToken()) {
        setIsAuthChecking(false);
        return;
      }

      try {
        const user = await api.getMe();
        if (active) {
          setCurrentUser(user);
          setStoredUser(user);
        }
      } catch {
        removeStoredToken();
        if (active) setCurrentUser(null);
      } finally {
        if (active) setIsAuthChecking(false);
      }
    };

    void initAuth();

    const handleUnauthorized = () => setCurrentUser(null);
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      active = false;
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Failed to notify the server about logout:', error);
    }
    removeStoredToken();
    setCurrentUser(null);
    navigate('/login', { replace: true });
  };

  if (isAuthChecking) return <LoadingScreen />;

  const handleStartWatch = (item: ContentItem) => {
    navigate(`/watch/${encodeURIComponent(item.id)}`, { state: { item } });
  };

  const getPublicElement = (view: 'login' | 'register') => {
    if (currentUser) {
      return <Navigate to={getReturnPath(location.state)} replace />;
    }

    if (view === 'login') {
      return (
        <LoginView
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            navigate(getReturnPath(location.state), { replace: true });
          }}
          onNavigateToRegister={() => navigate('/register', { state: location.state })}
        />
      );
    }

    return (
      <RegisterView
        onRegisterSuccess={(user) => {
          setCurrentUser(user);
          navigate(getReturnPath(location.state), { replace: true });
        }}
        onNavigateToLogin={() => navigate('/login', { state: location.state })}
      />
    );
  };

  return (
    <Routes>
      <Route path="/login" element={getPublicElement('login')} />
      <Route path="/register" element={getPublicElement('register')} />
      <Route element={<ProtectedRoute currentUser={currentUser} />}>
        <Route
          element={
            <AppLayout
              currentUser={currentUser!}
              onLogout={handleLogout}
              onUserUpdated={setCurrentUser}
              onAccountDeleted={handleLogout}
            />
          }
        >
          <Route index element={<Navigate to="/library" replace />} />
          <Route path="library" element={<LibraryView onWatchVideo={handleStartWatch} />} />
          <Route path="my-videos" element={<MyVideosView onWatchVideo={handleStartWatch} />} />
          <Route path="classes">
            <Route index element={<ClassesPage currentUser={currentUser!} onWatchVideo={handleStartWatch} />} />
            <Route path=":classId" element={<ClassesPage currentUser={currentUser!} onWatchVideo={handleStartWatch} />} />
          </Route>
          <Route path="history" element={<HistoryView />} />
          <Route path="watch/:contentId" element={<WatchRoute />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={currentUser ? '/library' : '/login'} replace />} />
    </Routes>
  );
}
