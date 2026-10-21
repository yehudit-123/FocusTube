/**
 * FocusTube - My Videos View (הסרטונים שלי)
 */

import React, { useState, useEffect } from 'react';
import { ContentItem } from '../types';
import { api } from '../services/api';
import { VideoCard } from '../components/VideoCard';
import { AddVideoModal } from '../components/AddVideoModal';
import { Plus, Loader2, Video as VideoIcon, AlertCircle } from 'lucide-react';

interface MyVideosViewProps {
  onWatchVideo: (item: ContentItem) => void;
}

export const MyVideosView: React.FC<MyVideosViewProps> = ({ onWatchVideo }) => {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const fetchMyVideos = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getContent({ scope: 'mine' });
      setItems(data);
    } catch (err: any) {
      setError(err?.message || 'אירעה שגיאה בטעינת הסרטונים האישיים');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMyVideos();
  }, []);

  const handleVideoAdded = (newItem: ContentItem) => {
    // An already-existing video comes back from the server as the same item: move it to the top instead of duplicating it.
    setItems((prev) => [newItem, ...prev.filter((it) => it.video.id !== newItem.video.id)]);
  };

  const handleVideoDeleted = (deletedContentId: string) => {
    setItems((prev) => prev.filter((it) => it.id !== deletedContentId));
  };

  const handleVideoUpdated = (updatedVideo: any) => {
    setItems((prev) =>
      prev.map((it) => (it.video.id === updatedVideo.id ? { ...it, video: updatedVideo } : it))
    );
  };
  // After a permanent delete of a flawed video: reload the list quietly.
  // The server either removed the user's link (item disappears) or
  // keeps it, in which case it comes back as an "unavailable" item.
  const refreshMyVideosQuietly = async () => {
    try {
      const data = await api.getContent({ scope: 'mine' });
      setItems(data);
    } catch (err: any) {
      setError(err?.message || 'אירעה שגיאה בטעינת הסרטונים האישיים');
    }
  };
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            הסרטונים שלי
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            רשימת הסרטונים שהעלית או קישרת לחשבונך לצורך מעקב ותרגול
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>הוסף סרטון חדש</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          <p className="text-sm">טוען את הסרטונים שלך...</p>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-3">
          <AlertCircle className="w-6 h-6 shrink-0" />
          <p>{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-900/60 border border-slate-800/80 rounded-3xl p-8 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center">
            <VideoIcon className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-1">עדיין לא הוספת סרטונים</h3>
            <p className="text-sm text-slate-400 max-w-md">
              הוסף סרטוני יוטיוב כדי ליצור לעצמך מרחב למידה אישי עם מעקב ריכוז ושאלות הבנה.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>הוסף סרטון ראשון</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <VideoCard
              key={item.id}
              contentItem={item}
              onWatch={onWatchVideo}
              onDelete={handleVideoDeleted}
              onVideoUpdated={handleVideoUpdated}
              showDelete={true}
              onVideoDeleted={refreshMyVideosQuietly}
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
