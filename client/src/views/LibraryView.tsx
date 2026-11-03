/**
 * FocusTube - Library View (כל הסרטונים)
 */

import React, { useState, useEffect, useRef } from 'react';
import { ContentItem } from '../types';
import { api } from '../services/api';
import { useAutoRefresh, keepIfSame } from '../hooks/useAutoRefresh';
import { VideoCard } from '../components/VideoCard';
import { AddVideoModal } from '../components/AddVideoModal';
import { Search, Plus, Loader2, Sparkles, AlertCircle, BookOpen } from 'lucide-react';

const CATEGORIES = [
  'הכל',
  'מתמטיקה',
  'מדעים',
  'שפות',
  'היסטוריה',
  'מחשבים והייטק',
  'אמנות ומוזיקה',
  'חברה וכלכלה',
  'פיתוח אישי',
  'אחר',
];

interface LibraryViewProps {
  onWatchVideo: (item: ContentItem) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onWatchVideo }) => {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('הכל');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // The last submitted filter: the auto-refresh uses it, not the text still being typed.
  const submittedFilterRef = useRef<{ search: string; category?: string } | null>(null);

  const fetchVideos = async () => {
    const filter = {
      search: searchQuery,
      category: selectedCategory === 'הכל' ? undefined : selectedCategory,
    };
    submittedFilterRef.current = filter;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getContent({ scope: 'all', ...filter });
      setItems(data);
    } catch (err: any) {
      setError(err?.message || 'אירעה שגיאה בטעינת ספריית הסרטונים');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, [selectedCategory]);

  // Silent refresh: no spinner, and errors are left for the next tick.
  useAutoRefresh(async () => {
    const filter = submittedFilterRef.current;
    if (!filter || isLoading) return;
    const data = await api.getContent({ scope: 'all', ...filter });
    // A newer search was submitted meanwhile: its own fetch owns the list.
    if (submittedFilterRef.current !== filter) return;
    setItems((prev) => keepIfSame(prev, data));
    setError(null);
  }, { enabled: !isAddModalOpen });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVideos();
  };

  const handleVideoAdded = (newItem: ContentItem) => {
    // An already-existing video comes back from the server as the same item: move it to the top instead of duplicating it.
    setItems((prev) => [newItem, ...prev.filter((it) => it.video.id !== newItem.video.id)]);
  };

  const handleVideoUpdated = (updatedVideo: any) => {
    setItems((prev) =>
      prev.map((it) => (it.video.id === updatedVideo.id ? { ...it, video: updatedVideo } : it))
    );
  };

    const handleVideoDeleted = (videoId: string) => {
    setItems((prev) => prev.filter((it) => it.video.id !== videoId));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
      {/* Hero Banner / Header */}
      <div className="relative rounded-3xl bg-gradient-to-l from-indigo-950/70 via-slate-900 to-slate-900 border border-slate-800 p-6 sm:p-8 overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>למידה חכמה מבוססת קשב ובינה מלאכותית</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            ספריית הסרטונים הלימודיים
          </h1>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            בחר סרטון והתחל לצפות. המערכת תנטר את רמת הריכוז שלך דרך המצלמה, תזהה מתי פספסת נקודה חשובה, ותעצור לשאלת הבנה ממוקדת.
          </p>
        </div>

        {/* Action button */}
        <div className="relative z-10 mt-6 sm:mt-0 sm:absolute sm:left-8 sm:bottom-8">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-xl shadow-indigo-600/30 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>הוסף סרטון יוטיוב</span>
          </button>
        </div>
      </div>

      {/* Search and Category Filters */}
      <div className="space-y-4">
        {/* Search bar */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש לפי כותרת או נושא לימודי..."
              className="w-full pr-12 pl-4 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-medium text-sm transition-colors border border-slate-700 cursor-pointer"
          >
            חפש
          </button>
        </form>

        {/* Categories pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Video Grid / Loading / Empty States */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm">טוען את ספריית הסרטונים...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-3">
          <AlertCircle className="w-6 h-6 shrink-0" />
          <p>{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center">
            <BookOpen className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-1">לא נמצאו סרטונים תואמים</h3>
            <p className="text-sm text-slate-400 max-w-md">
              לא נמצאו תוצאות עבור החיפוש או הקטגוריה שנבחרו. נסה לשנות את הסינון או הוסף סרטון יוטיוב חדש לספרייה.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>הוסף סרטון חדש כעת</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <VideoCard
              key={item.id}
              contentItem={item}
              onWatch={onWatchVideo}
              onVideoUpdated={handleVideoUpdated}
              showDelete={false}
              onVideoDeleted={handleVideoDeleted}
            />
          ))}
        </div>
      )}

      {/* Add Video Modal */}
      <AddVideoModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onVideoAdded={handleVideoAdded}
      />
    </div>
  );
};
