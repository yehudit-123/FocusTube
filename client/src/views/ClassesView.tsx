import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Classroom, ContentItem, Video } from '../types';
import { api } from '../services/api';
import { useAutoRefresh, keepIfSame } from '../hooks/useAutoRefresh';
import { ClassHeader } from '../components/classes/ClassHeader';
import { ClassTabs, ClassTab } from '../components/classes/ClassTabs';
import { ClassVideosTab, ClassVideoEntry } from '../components/classes/ClassVideosTab';
import { ClassStudentsTab } from '../components/classes/ClassStudentsTab';
import { ClassStatsTab } from '../components/classes/ClassStatsTab';
import { ClassJoinPrompt } from '../components/classes/ClassJoinPrompt';
import {
  Users,
  Plus,
  KeyRound,
  ShieldCheck,
  X,
  AlertCircle,
  Loader2,
  BarChart3,
  Video as VideoIcon,
} from 'lucide-react';

type ClassTabId = 'videos' | 'students' | 'stats';

interface ClassesViewProps {
  currentUserId: string;
  onWatchVideo: (item: ContentItem) => void;
}

export const ClassesView: React.FC<ClassesViewProps> = ({ currentUserId, onWatchVideo }) => {
  const navigate = useNavigate();
  const { classId } = useParams<{ classId: string }>();
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selectedClass, setSelectedClass] = useState<Classroom | null>(null);
  const [activeTab, setActiveTab] = useState<ClassTabId>('videos');
  const [availableVideos, setAvailableVideos] = useState<ContentItem[]>([]);
  const [classActionMessage, setClassActionMessage] = useState<string | null>(null);
  const [classActionError, setClassActionError] = useState<string | null>(null);
  const [isUpdatingClass, setIsUpdatingClass] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [availableLoaded, setAvailableLoaded] = useState(false);
  const [unavailableItems, setUnavailableItems] = useState<Record<string, ContentItem>>({});

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  // Create form
  const [className, setClassName] = useState('');
  const [classCategory, setClassCategory] = useState('אחר');
  const [classRole, setClassRole] = useState<'student' | 'teacher'>('student');
  const [authorizedEmailsStr, setAuthorizedEmailsStr] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Join form
  const [joinCode, setJoinCode] = useState('');
  const [confirmedPrivacy, setConfirmedPrivacy] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Bumped when a user action starts, so an auto-refresh already in flight drops its
  // (older) result instead of overwriting the action's result.
  const actionVersionRef = useRef(0);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const targetClassId = classId || classes[0]?.id;
    if (targetClassId && selectedClass?.id !== targetClassId) {
      loadClassDetails(targetClassId);
    }
  }, [classId, classes, isLoading, selectedClass?.id]);

  // Another class starts on the videos tab with no leftover messages.
  useEffect(() => {
    setActiveTab('videos');
    setClassActionMessage(null);
    setClassActionError(null);
  }, [selectedClass?.id]);

  useEffect(() => {
    if (!selectedClass) {
      setAvailableVideos([]);
      setAvailableLoaded(false);
      return;
    }

    let active = true;
    setAvailableLoaded(false);
    api.getContent({ scope: 'all' })
      .then((items) => {
        if (active) {
          setAvailableVideos(items);
          setAvailableLoaded(true);
        }
      })
      .catch((err: any) => {
        if (active) setClassActionError(err?.message || 'לא ניתן לטעון סרטונים לכיתה');
      });
    return () => {
      active = false;
    };
  }, [selectedClass?.id]);

  // Class items that are not in the library anymore: ask the server.
  // For deleted videos it returns a placeholder with status "deleted".
  useEffect(() => {
    if (!selectedClass || !availableLoaded) return;

    const missing = selectedClass.content_ids.filter(
      (contentId) =>
        !availableVideos.some(
          (c) => c.id === contentId || `lib-${c.video.id}` === contentId
        )
    );
    if (missing.length === 0) {
      setUnavailableItems({});
      return;
    }

    let active = true;
    Promise.all(
      missing.map(async (contentId) => {
        try {
          return [contentId, await api.getContentItem(contentId)] as const;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (!active) return;
      const map: Record<string, ContentItem> = {};
      results.forEach((r) => {
        if (r && r[1].video.status === 'deleted') map[r[0]] = r[1];
      });
      setUnavailableItems(map);
    });

    return () => {
      active = false;
    };
  }, [selectedClass?.content_ids.join(','), availableVideos, availableLoaded]);

  const fetchClasses = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getClasses();
      setClasses(data);
    } catch (err: any) {
      setError(err?.message || 'אירעה שגיאה בטעינת הכיתות');
    } finally {
      setIsLoading(false);
    }
  };

  const loadClassDetails = async (classId: string) => {
    setClassActionError(null);
    try {
      const details = await api.getClass(classId);
      setSelectedClass(details);
    } catch (err: any) {
      console.error('Error fetching class details:', err);
      setClassActionError(err?.message || 'לא ניתן לטעון את פרטי הכיתה');
    }
  };

  // Silent refresh of the class list, the selected class (incl. teacher metrics) and the
  // available videos. Unlike fetchClasses/loadClassDetails it never changes which class is
  // selected (except dropping one that is gone) and never touches loading/error/message state.
  const refreshClassesSilently = async () => {
    if (isLoading || isUpdatingClass || isJoining || isCreating) return;
    const actionVersion = actionVersionRef.current;
    const isStale = () => actionVersionRef.current !== actionVersion;

    const data = await api.getClasses();
    if (isStale()) return;
    setClasses((prev) => keepIfSame(prev, data));

    const selectedId = selectedClass?.id;
    if (!selectedId) return;

    const [details, items] = await Promise.all([
      // Deleted class or lost access: drop the selection.
      api.getClass(selectedId).catch(() => null),
      api.getContent({ scope: 'all' }).catch(() => null),
    ]);
    if (isStale()) return;
    setSelectedClass((prev) => {
      if (prev?.id !== selectedId) return prev; // the user picked another class meanwhile
      return details ? keepIfSame(prev, details) : null;
    });
    if (details && items) {
      setAvailableVideos((prev) => keepIfSame(prev, items));
      setAvailableLoaded(true);
    }
  };

  useAutoRefresh(refreshClassesSilently, { enabled: !isCreateModalOpen && !isJoinModalOpen });

  // Keep the selected class and its entry in the side list in sync.
  const applyClassUpdate = (updated: Classroom) => {
    setSelectedClass(updated);
    setClasses((current) => current.map((cls) => (cls.id === updated.id ? updated : cls)));
  };

  // Runs an owner action on the selected class, then shows the class as the server returns it.
  const runClassAction = async (
    action: (classroom: Classroom) => Promise<Classroom>,
    successMessage: string,
    fallbackError: string
  ): Promise<boolean> => {
    if (!selectedClass) return false;
    actionVersionRef.current++;
    setIsUpdatingClass(true);
    setClassActionError(null);
    setClassActionMessage(null);
    try {
      applyClassUpdate(await action(selectedClass));
      setClassActionMessage(successMessage);
      return true;
    } catch (err: any) {
      setClassActionError(err?.message || fallbackError);
      return false;
    } finally {
      setIsUpdatingClass(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;

    actionVersionRef.current++;
    setIsCreating(true);
    try {
      const emails = authorizedEmailsStr
        .split('\n')
        .map((e) => e.trim())
        .filter((e) => e.length > 0);

      const created = await api.createClass({
        name: className.trim(),
        category: classCategory,
        role: classRole,
        authorized_students: emails,
      });

      setClasses((prev) => [created, ...prev]);
      setSelectedClass(created);
      navigate(`/classes/${created.id}`);
      setIsCreateModalOpen(false);
      setClassName('');
      setAuthorizedEmailsStr('');
    } catch (err: any) {
      alert(err?.message || 'שגיאה ביצירת הכיתה');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    actionVersionRef.current++;
    setIsJoining(true);
    setJoinError(null);

    try {
      // A teacher class may answer with membership "pending": the request waits for the teacher.
      const joined = await api.joinClass({
        join_code: joinCode.trim(),
        confirmed_privacy: confirmedPrivacy,
      });

      setClasses((prev) => [joined, ...prev.filter((cls) => cls.id !== joined.id)]);
      setSelectedClass(joined);
      navigate(`/classes/${joined.id}`);
      setIsJoinModalOpen(false);
      setJoinCode('');
      setConfirmedPrivacy(false);
    } catch (err: any) {
      setJoinError(err?.message || 'שגיאה בהצטרפות לכיתה');
    } finally {
      setIsJoining(false);
    }
  };

  // A student invited by the teacher sees the class before joining, but the teacher
  // only gets data for members who joined and approved the privacy notice.
  const handleJoinSelectedClass = async (privacyConfirmed: boolean) => {
    if (!selectedClass) return;
    actionVersionRef.current++;
    setIsJoining(true);
    setClassActionError(null);
    try {
      applyClassUpdate(await api.joinClass({
        join_code: selectedClass.join_code,
        confirmed_privacy: privacyConfirmed,
      }));
    } catch (err: any) {
      setClassActionError(err?.message || 'שגיאה בהצטרפות לכיתה');
    } finally {
      setIsJoining(false);
    }
  };

  const handleAddStudents = (emails: string[]) =>
    runClassAction(
      (cls) => api.updateClass(cls.id, { authorized_students: [...new Set([...cls.authorized_students, ...emails])] }),
      'התלמידים נוספו. יש לשלוח להם את קוד הכיתה כדי שיוכלו להצטרף.',
      'לא ניתן להוסיף תלמידים לכיתה'
    );

  const handleCancelInvite = (email: string) =>
    runClassAction(
      (cls) => api.updateClass(cls.id, { authorized_students: cls.authorized_students.filter((e) => e !== email) }),
      'ההזמנה בוטלה.',
      'לא ניתן לבטל את ההזמנה'
    );

  const handleApproveRequest = (userId: string) =>
    runClassAction((cls) => api.approveJoinRequest(cls.id, userId), 'התלמיד/ה צורף/ה לכיתה.', 'לא ניתן לאשר את הבקשה');

  const handleDeclineRequest = (userId: string) =>
    runClassAction((cls) => api.declineJoinRequest(cls.id, userId), 'הבקשה נדחתה.', 'לא ניתן לדחות את הבקשה');

  const handleRemoveMember = (userId: string) =>
    runClassAction((cls) => api.removeClassMember(cls.id, userId), 'התלמיד/ה הוסר/ה מהכיתה.', 'לא ניתן להסיר את התלמיד/ה');

  const handleAddVideo = (videoId: string) =>
    runClassAction(
      async (cls) => {
        await api.addVideoToClass(cls.id, `lib-${videoId}`);
        return api.getClass(cls.id);
      },
      'הסרטון נוסף לכיתה בהצלחה.',
      'לא ניתן להוסיף את הסרטון לכיתה'
    );

  const handleRemoveVideo = (contentId: string) =>
    runClassAction(
      async (cls) => {
        await api.removeVideoFromClass(cls.id, contentId);
        return api.getClass(cls.id);
      },
      'הסרטון הוסר מהכיתה.',
      'לא ניתן להסיר את הסרטון מהכיתה'
    );

  // VideoCard reports status changes (processing finished, or a deleted video was
  // re-uploaded, which keeps its old id) so the class list stays current.
  const handleClassVideoUpdated = useCallback((updated: Video) => {
    setAvailableVideos((prev) =>
      prev.some((it) => it.video.id === updated.id)
        ? prev.map((it) => (it.video.id === updated.id ? { ...it, video: updated } : it))
        : [{
            id: `lib-${updated.id}`,
            user_id: currentUserId,
            video_id: updated.id,
            video: updated,
            created_at: updated.created_at,
          }, ...prev]
    );
  }, [currentUserId]);

  const watchClassVideo = (item: ContentItem) => onWatchVideo({ ...item, id: `lib-${item.video.id}` });

  const classVideos: ClassVideoEntry[] = selectedClass
    ? selectedClass.content_ids.flatMap((contentId) => {
        const item =
          availableVideos.find((candidate) =>
            candidate.id === contentId || `lib-${candidate.video.id}` === contentId
          ) ?? unavailableItems[contentId];
        return item ? [{ contentId, item }] : [];
      })
    : [];

  const isOwner = selectedClass?.membership === 'owner';
  const isMember = isOwner || selectedClass?.membership === 'member';

  const tabs: ClassTab<ClassTabId>[] = [
    { id: 'videos', label: 'סרטונים', icon: VideoIcon },
    {
      id: 'students',
      label: selectedClass?.role === 'teacher' ? 'תלמידים' : 'משתתפים',
      icon: Users,
      badge: isOwner ? selectedClass?.join_requests.length : undefined,
    },
    ...(isOwner && selectedClass?.role === 'teacher'
      ? [{ id: 'stats' as const, label: 'נתוני צפייה', icon: BarChart3 }]
      : []),
  ];
  const currentTab = tabs.some((t) => t.id === activeTab) ? activeTab : 'videos';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            כיתות וקבוצות לימוד
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            ארגון סרטונים לפי מקצועות, שיתוף עם חברים ומעקב מורה מפורט אחר רמות הריכוז
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsJoinModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-sm transition-colors cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-indigo-400" />
            <span>הצטרף עם קוד כיתה</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>פתח כיתה חדשה</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm">טוען כיתות לימוד...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-3">
          <AlertCircle className="w-6 h-6 shrink-0" />
          <p>{error}</p>
        </div>
      ) : classes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center">
            <Users className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-1">עדיין אין כיתות פעילות</h3>
            <p className="text-sm text-slate-400 max-w-md">
              באפשרותך לפתוח כיתת תלמידים לארגון סרטונים, או כיתת מורה למעקב אחר רמת הריכוז של התלמידים.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all cursor-pointer"
            >
              פתח כיתה חדשה
            </button>
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-sm transition-colors cursor-pointer"
            >
              הצטרף עם קוד
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Class List (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
              הכיתות שלי ({classes.length})
            </h3>

            <div className="space-y-2.5">
              {classes.map((cls) => {
                const isSelected = selectedClass?.id === cls.id;
                const isTeacher = cls.role === 'teacher';
                const requestsCount = cls.membership === 'owner' ? cls.join_requests.length : 0;

                return (
                  <div
                    key={cls.id}
                    onClick={() => navigate(`/classes/${cls.id}`)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                      isSelected
                        ? 'bg-indigo-600/15 border-indigo-500/60 shadow-lg shadow-indigo-600/10'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-white text-base leading-tight">
                          {cls.name}
                        </h4>
                        <span className="text-xs text-indigo-300 font-medium">
                          {cls.category}
                        </span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                          isTeacher
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {isTeacher ? 'כיתת מורה' : 'קבוצת תלמיד'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs text-slate-400">
                      <span>{cls.member_count} משתתפים</span>
                      {cls.membership === 'pending' && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-semibold">ממתין לאישור</span>
                      )}
                      {cls.membership === 'invited' && (
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 font-semibold">הזמנה להצטרפות</span>
                      )}
                      {requestsCount > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-semibold">
                          {requestsCount} בקשות הצטרפות
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected class (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {selectedClass && (
              <div className="space-y-6">
                <ClassHeader classroom={selectedClass} />

                {!isMember ? (
                  <ClassJoinPrompt
                    key={selectedClass.id}
                    classroom={selectedClass}
                    isJoining={isJoining}
                    error={classActionError}
                    onJoin={handleJoinSelectedClass}
                  />
                ) : (
                  <>
                    <ClassTabs tabs={tabs} activeTab={currentTab} onChange={setActiveTab} />

                    <div role="tabpanel" className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                      {currentTab === 'videos' && (
                        <ClassVideosTab
                          key={selectedClass.id}
                          classVideos={classVideos}
                          libraryVideos={availableVideos}
                          libraryLoaded={availableLoaded}
                          canManage={isOwner}
                          isBusy={isUpdatingClass}
                          onAddVideo={handleAddVideo}
                          onRemoveVideo={handleRemoveVideo}
                          onWatch={watchClassVideo}
                          onVideoUpdated={handleClassVideoUpdated}
                        />
                      )}
                      {currentTab === 'students' && (
                        <ClassStudentsTab
                          key={selectedClass.id}
                          classroom={selectedClass}
                          currentUserId={currentUserId}
                          isBusy={isUpdatingClass}
                          onApproveRequest={handleApproveRequest}
                          onDeclineRequest={handleDeclineRequest}
                          onRemoveMember={handleRemoveMember}
                          onAddStudents={handleAddStudents}
                          onCancelInvite={handleCancelInvite}
                        />
                      )}
                      {currentTab === 'stats' && <ClassStatsTab metrics={selectedClass.metrics ?? []} />}

                      {classActionError && <p role="alert" className="text-sm text-rose-300">{classActionError}</p>}
                      {classActionMessage && <p role="status" className="text-sm text-emerald-300">{classActionMessage}</p>}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Class Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-4">יצירת כיתת לימוד חדשה</h2>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  שם הכיתה
                </label>
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="לדוגמה: מתמטיקה 5 יח״ל - הכנה לבגרות"
                  required
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  קטגוריה
                </label>
                <select
                  value={classCategory}
                  onChange={(e) => setClassCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                >
                  {['מתמטיקה', 'מדעים', 'שפות', 'היסטוריה', 'מחשבים והייטק', 'אמנות ומוזיקה', 'חברה וכלכלה', 'פיתוח אישי', 'אחר'].map(
                    (c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  סוג הכיתה
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setClassRole('student')}
                    className={`p-3 rounded-xl border text-center font-medium text-sm transition-all ${
                      classRole === 'student'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    כיתת תלמיד (אישית)
                  </button>

                  <button
                    type="button"
                    onClick={() => setClassRole('teacher')}
                    className={`p-3 rounded-xl border text-center font-medium text-sm transition-all ${
                      classRole === 'teacher'
                        ? 'bg-purple-600/20 border-purple-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    כיתת מורה (מעקב ציונים)
                  </button>
                </div>
              </div>

              {classRole === 'teacher' && (
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-1.5">
                    אימיילים של תלמידים מורשים (שורה לכל אימייל - אופציונלי)
                  </label>
                  <textarea
                    rows={3}
                    value={authorizedEmailsStr}
                    onChange={(e) => setAuthorizedEmailsStr(e.target.value)}
                    placeholder="student1@school.edu&#10;student2@school.edu"
                    dir="ltr"
                    className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm text-left font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    תלמידים מרשימה זו יצטרפו מיד עם קוד הכיתה. תלמידים אחרים ישלחו בקשת הצטרפות לאישורך.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-300 hover:text-white"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/30"
                >
                  {isCreating ? 'יוצר כיתה...' : 'צור כיתה'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Class Modal with Privacy Consent Notice (Section 9) */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setIsJoinModalOpen(false)}
              className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">הצטרפות לכיתה</h2>
                <p className="text-xs text-slate-400">הזן את קוד ההצטרפות שקיבלת מהמורה או מחבר</p>
              </div>
            </div>

            {joinError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{joinError}</span>
              </div>
            )}

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-1.5">
                  קוד כיתה
                </label>
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="לדוגמה: MTH101"
                  required
                  dir="ltr"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono uppercase tracking-widest text-center text-lg focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Mandatory Privacy Notice and Confirmation (Section 9) */}
              <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 space-y-3">
                <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>הודעת פרטיות להצטרפות לכיתת מורה</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  בהצטרפות לכיתת מורה, המורה יוכל לצפות בנתוני הריכוז המצרפיים וההתקדמות שלך בלבד (ללא צילומי וידאו או נקודות פנים).
                  אם המורה לא הוסיף/ה אותך מראש, תישלח אליו/ה בקשת הצטרפות לאישור.
                </p>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmedPrivacy}
                    onChange={(e) => setConfirmedPrivacy(e.target.checked)}
                    required
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-200 font-medium">
                    אני מאשר/ת את שיתוף נתוני הריכוז עם המורה בכיתה זו
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-300 hover:text-white"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isJoining || !confirmedPrivacy}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {isJoining ? 'מצטרף...' : 'הצטרף לכיתה'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
