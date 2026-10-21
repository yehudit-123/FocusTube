/**
 * FocusTube - Classrooms View (כיתות לימוד)
 * Supports student collections, teacher dashboards, invite codes,
 * and privacy consent confirmation.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Classroom, StudentMetric, Video } from '../types';
import { api } from '../services/api';
import { VideoCard } from '../components/VideoCard';
import {
  Users,
  Plus,
  KeyRound,
  GraduationCap,
  BookOpen,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  X,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  BarChart3,
  HelpCircle,
  Clock,
  Mail,
  Video as VideoIcon,
  Trash2,
  Search,
} from 'lucide-react';
import { ContentItem } from '../types';

interface ClassesViewProps {
  currentUserId: string;
  onWatchVideo: (item: ContentItem) => void;
}

export const ClassesView: React.FC<ClassesViewProps> = ({ currentUserId, onWatchVideo }) => {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [selectedClass, setSelectedClass] = useState<Classroom | null>(null);
  const [availableVideos, setAvailableVideos] = useState<ContentItem[]>([]);
  const [newStudentEmails, setNewStudentEmails] = useState('');
  const [videoSearch, setVideoSearch] = useState('');
  const [isVideoPickerOpen, setIsVideoPickerOpen] = useState(false);
  const videoPickerRef = useRef<HTMLDivElement | null>(null);
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
  const [selectedClassPrivacy, setSelectedClassPrivacy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  // The add-video list shows only while the teacher is searching: close it on a click
  // outside the search area (clicks on its "add" buttons keep it open).
  useEffect(() => {
    if (!isVideoPickerOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (videoPickerRef.current && !videoPickerRef.current.contains(e.target as Node)) {
        setIsVideoPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isVideoPickerOpen]);

  // Switching to another class starts with a closed, empty search.
  useEffect(() => {
    setIsVideoPickerOpen(false);
    setVideoSearch('');
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
      if (data.length > 0) {
        loadClassDetails(data[0].id);
      }
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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;

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

    setIsJoining(true);
    setJoinError(null);

    try {
      const joined = await api.joinClass({
        join_code: joinCode.trim(),
        confirmed_privacy: confirmedPrivacy,
      });

      setClasses((prev) => [joined, ...prev]);
      setSelectedClass(joined);
      setIsJoinModalOpen(false);
      setJoinCode('');
      setConfirmedPrivacy(false);
    } catch (err: any) {
      setJoinError(err?.message || 'שגיאה בהצטרפות לכיתה');
    } finally {
      setIsJoining(false);
    }
  };

  // A student authorized by the teacher sees the class before joining, but the teacher
  // only gets data for members who joined and approved the privacy notice.
  const handleJoinSelectedClass = async () => {
    if (!selectedClass) return;
    setIsJoining(true);
    setClassActionError(null);
    try {
      const joined = await api.joinClass({
        join_code: selectedClass.join_code,
        confirmed_privacy: selectedClassPrivacy,
      });
      setSelectedClass((current) => current ? { ...current, ...joined } : joined);
      setClasses((current) => current.map((cls) => cls.id === joined.id ? { ...cls, ...joined } : cls));
      setSelectedClassPrivacy(false);
    } catch (err: any) {
      setClassActionError(err?.message || 'שגיאה בהצטרפות לכיתה');
    } finally {
      setIsJoining(false);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleAddStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || !newStudentEmails.trim()) return;

    const emails = newStudentEmails
      .split(/[,\n]/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    const authorizedStudents = [...new Set([...selectedClass.authorized_students, ...emails])];
    setIsUpdatingClass(true);
    setClassActionError(null);
    setClassActionMessage(null);
    try {
      const updated = await api.updateClass(selectedClass.id, { authorized_students: authorizedStudents });
      setSelectedClass((current) => current ? { ...current, ...updated } : updated);
      setClasses((current) => current.map((cls) => cls.id === updated.id ? { ...cls, ...updated } : cls));
      setNewStudentEmails('');
      setClassActionMessage('התלמידים נוספו לרשימת המורשים. יש לשלוח להם את קוד הכיתה כדי שיוכלו להצטרף.');
      await loadClassDetails(selectedClass.id);
    } catch (err: any) {
      setClassActionError(err?.message || 'לא ניתן להוסיף תלמידים לכיתה');
    } finally {
      setIsUpdatingClass(false);
    }
  };

  const handleAddVideo = async (videoId: string) => {
    if (!selectedClass) return;

    setIsUpdatingClass(true);
    setClassActionError(null);
    setClassActionMessage(null);
    try {
      await api.addVideoToClass(selectedClass.id, `lib-${videoId}`);
      setClassActionMessage('הסרטון נוסף לכיתה בהצלחה.');
      await loadClassDetails(selectedClass.id);
    } catch (err: any) {
      setClassActionError(err?.message || 'לא ניתן להוסיף את הסרטון לכיתה');
    } finally {
      setIsUpdatingClass(false);
    }
  };

  const handleRemoveVideo = async (contentId: string) => {
    if (!selectedClass) return;
    setIsUpdatingClass(true);
    setClassActionError(null);
    try {
      await api.removeVideoFromClass(selectedClass.id, contentId);
      await loadClassDetails(selectedClass.id);
      setClassActionMessage('הסרטון הוסר מהכיתה.');
    } catch (err: any) {
      setClassActionError(err?.message || 'לא ניתן להסיר את הסרטון מהכיתה');
    } finally {
      setIsUpdatingClass(false);
    }
  };

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

     const classVideos = selectedClass
    ? selectedClass.content_ids.flatMap((contentId) => {
        const item = availableVideos.find((candidate) =>
          candidate.id === contentId || `lib-${candidate.video.id}` === contentId
        );
        if (item) return [{ contentId, item, unavailable: false }];
        const gone = unavailableItems[contentId];
        return gone ? [{ contentId, item: gone, unavailable: true }] : [];
      })
    : [];

  const needsToJoin = !!selectedClass &&
    selectedClass.role === 'teacher' &&
    selectedClass.owner_id !== currentUserId &&
    !selectedClass.member_ids.includes(currentUserId);

  // Same matching as the library search: title or category contains the query.
  const videoQuery = videoSearch.trim().toLowerCase();
  const availableToAdd = selectedClass
    ? availableVideos.filter((item) =>
        !selectedClass.content_ids.includes(item.id) &&
        !selectedClass.content_ids.includes(`lib-${item.video.id}`) &&
        (!videoQuery ||
          item.video.title.toLowerCase().includes(videoQuery) ||
          item.video.categories.some((cat) => cat.toLowerCase().includes(videoQuery)))
      )
    : [];

  const renderClassVideos = (canRemove: boolean) =>
    classVideos.length === 0 ? (
      <p className="text-sm text-slate-400">עדיין לא נוספו סרטונים לכיתה.</p>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {classVideos.map(({ contentId, item }) => (
          <div key={contentId} className="relative">
            <VideoCard
              contentItem={{ ...item, id: `lib-${item.video.id}` }}
              onWatch={watchClassVideo}
              onVideoUpdated={handleClassVideoUpdated}
            />
            {canRemove && (
              <button
                type="button"
                onClick={() => handleRemoveVideo(contentId)}
                disabled={isUpdatingClass}
                className="absolute top-3 left-3 p-2 rounded-lg bg-slate-950/80 text-slate-300 hover:text-rose-300 hover:bg-rose-500/20 backdrop-blur-sm disabled:opacity-50"
                title="הסר סרטון מהכיתה"
                aria-label={`הסר את ${item.video.title} מהכיתה`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    );

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

                return (
                  <div
                    key={cls.id}
                    onClick={() => loadClassDetails(cls.id)}
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
                      <span>קוד הצטרפות: <strong className="font-mono text-white">{cls.join_code}</strong></span>
                      <span>{cls.member_ids?.length || 1} משתתפים</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Class Details & Dashboard (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {selectedClass && (
              <div className="space-y-6">
                {/* Header Banner */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {selectedClass.category}
                        </span>
                        <span className="text-xs text-slate-400">
                          יוצר הכיתה: {selectedClass.owner_name}
                        </span>
                      </div>
                      <h2 className="text-2xl font-black text-white">
                        {selectedClass.name}
                      </h2>
                    </div>

                    {/* Join Code Sharing */}
                    <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-2xl">
                      <span className="text-xs text-slate-400">קוד שיתוף:</span>
                      <span className="text-base font-black font-mono text-indigo-400">
                        {selectedClass.join_code}
                      </span>
                      <button
                        onClick={() => copyToClipboard(selectedClass.join_code)}
                        className="p-1 hover:text-white text-slate-400 transition-colors"
                        title="העתק קוד ללוח"
                      >
                        {copiedCode ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Teacher Tracking Dashboard (Section 9) */}
                {selectedClass.owner_id === currentUserId && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
                    {selectedClass.role === 'teacher' && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-white font-bold text-lg">
                          <Mail className="w-5 h-5 text-indigo-400" />
                          <span>הוספת תלמידים לכיתה</span>
                        </div>
                        <form onSubmit={handleAddStudents} className="flex flex-col sm:flex-row gap-3">
                          <textarea
                            value={newStudentEmails}
                            onChange={(e) => setNewStudentEmails(e.target.value)}
                            rows={2}
                            dir="ltr"
                            placeholder="student1@school.edu, student2@school.edu"
                            aria-label="כתובות דוא״ל של תלמידים"
                            className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm text-left font-mono focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="submit"
                            disabled={isUpdatingClass || !newStudentEmails.trim()}
                            className="self-start flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
                          >
                            <Plus className="w-4 h-4" />
                            הוסף תלמידים
                          </button>
                        </form>
                        <p className="text-xs text-slate-400">
                          המערכת תאפשר לכתובות האלה להצטרף. לאחר מכן שלחו לתלמידים את קוד הכיתה: <strong className="font-mono text-indigo-300">{selectedClass.join_code}</strong>
                        </p>
                        {selectedClass.authorized_students.length > 0 && (
                          <p className="text-xs text-slate-300">
                            תלמידים מורשים: {selectedClass.authorized_students.join(', ')}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-4 border-t border-slate-800 pt-5">
                      <div className="flex items-center gap-2 text-white font-bold text-lg">
                        <VideoIcon className="w-5 h-5 text-indigo-400" />
                        <span>סרטונים בכיתה</span>
                      </div>
                      <div
                        ref={videoPickerRef}
                        className="space-y-2"
                        onKeyDown={(e) => { if (e.key === 'Escape') setIsVideoPickerOpen(false); }}
                      >
                        <div className="relative">
                          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={videoSearch}
                            onChange={(e) => { setVideoSearch(e.target.value); setIsVideoPickerOpen(true); }}
                            onFocus={() => setIsVideoPickerOpen(true)}
                            placeholder="חיפוש סרטון בכל הספרייה לפי כותרת או נושא..."
                            aria-label="חיפוש סרטון להוספה לכיתה"
                            className="w-full pr-10 pl-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        {!isVideoPickerOpen ? null : !availableLoaded ? (
                          <p className="text-xs text-slate-400 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            טוען את ספריית הסרטונים...
                          </p>
                        ) : availableToAdd.length === 0 ? (
                          <p className="text-xs text-slate-400">
                            {videoQuery ? 'לא נמצאו סרטונים תואמים בספרייה.' : 'כל סרטוני הספרייה כבר נמצאים בכיתה.'}
                          </p>
                        ) : (
                          <ul className="max-h-72 overflow-y-auto space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                            {availableToAdd.map((item) => (
                              <li key={item.video.id} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-slate-800/60">
                                <img
                                  src={`https://img.youtube.com/vi/${item.video.youtube_id}/mqdefault.jpg`}
                                  alt=""
                                  loading="lazy"
                                  className="w-24 aspect-video shrink-0 rounded-md object-cover bg-slate-900"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-white line-clamp-2" title={item.video.title}>{item.video.title}</p>
                                  <p className="text-xs text-indigo-300 truncate">{item.video.categories.join(' · ')}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAddVideo(item.video.id)}
                                  disabled={isUpdatingClass}
                                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-50"
                                  aria-label={`הוסף את ${item.video.title} לכיתה`}
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  הוסף
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {renderClassVideos(true)}
                    </div>

                    {classActionError && <p role="alert" className="text-sm text-rose-300">{classActionError}</p>}
                    {classActionMessage && <p role="status" className="text-sm text-emerald-300">{classActionMessage}</p>}
                  </div>
                )}

                {needsToJoin && (
                  <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center gap-2 text-white font-bold text-lg">
                      <KeyRound className="w-5 h-5 text-indigo-400" />
                      <span>הצטרפות לכיתה</span>
                    </div>
                    <p className="text-sm text-slate-300">
                      המורה הוסיף/ה אותך לכיתה זו. כדי לצפות בסרטוני הכיתה יש להצטרף אליה ולאשר את הצגת נתוני הריכוז.
                    </p>
                    <label className="flex items-start gap-2.5 text-sm text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedClassPrivacy}
                        onChange={(e) => setSelectedClassPrivacy(e.target.checked)}
                        className="mt-1"
                      />
                      <span>אני מאשר/ת שהמורה יראה נתוני ריכוז מצרפיים בלבד (ללא וידאו או נקודות פנים).</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleJoinSelectedClass}
                      disabled={isJoining || !selectedClassPrivacy}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {isJoining && <Loader2 className="w-4 h-4 animate-spin" />}
                      הצטרף לכיתה
                    </button>
                    {classActionError && <p role="alert" className="text-sm text-rose-300">{classActionError}</p>}
                  </div>
                )}

                {selectedClass.owner_id !== currentUserId && !needsToJoin && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
                    <div className="flex items-center gap-2 text-white font-bold text-lg">
                      <VideoIcon className="w-5 h-5 text-indigo-400" />
                      <span>סרטונים בכיתה</span>
                    </div>
                    {renderClassVideos(false)}
                    {classActionError && <p role="alert" className="text-sm text-rose-300">{classActionError}</p>}
                    {classActionMessage && <p role="status" className="text-sm text-emerald-300">{classActionMessage}</p>}
                  </div>
                )}

                {selectedClass.role === 'teacher' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                      <div className="flex items-center gap-2 text-white font-bold text-lg">
                        <BarChart3 className="w-5 h-5 text-indigo-400" />
                        <span>לוח מעקב והישגי תלמידים (מורה בלבד)</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        מוצגים נתונים מצרפיים בלבד (ללא וידאו או נקודות פנים)
                      </span>
                    </div>

                    {!selectedClass.metrics || selectedClass.metrics.length === 0 ? (
                      <p className="text-sm text-slate-400 py-4 text-center">
                        עדיין אין נתוני צפייה עבור תלמידי כיתה זו. כאשר תלמידים יצפו בסרטונים, הנתונים יופיעו כאן אוטומטית.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {selectedClass.metrics.map((m) => (
                          <div
                            key={m.user_id}
                            className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <h4 className="font-bold text-white text-base">
                                  {m.display_name}
                                </h4>
                                <span className="text-xs text-slate-400 font-mono">
                                  {m.email}
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-center">
                                  <span className="block text-[10px] text-slate-400">ריכוז ממוצע</span>
                                  <span className="text-sm font-black font-mono text-emerald-400">
                                    {m.average_concentration.toFixed(2)}
                                  </span>
                                </div>
                                <div className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-center">
                                  <span className="block text-[10px] text-slate-400">סשנים</span>
                                  <span className="text-sm font-black font-mono text-white">
                                    {m.sessions_count}
                                  </span>
                                </div>
                                <div className="px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-center">
                                  <span className="block text-[10px] text-slate-400">תשובות נכונות</span>
                                  <span className="text-sm font-black font-mono text-indigo-400">
                                    {m.correct_answers_count} / {m.pauses_count}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
                    רק תלמידים מרשימה זו יוכלו להצטרף לכיתה.
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
