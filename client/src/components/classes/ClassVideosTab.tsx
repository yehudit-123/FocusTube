/**
 * FocusTube - "Videos" tab of a class: the class videos as cards, and for the
 * owner a live search over the whole library to add more.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ContentItem, Video } from '../../types';
import { VideoCard } from '../VideoCard';
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';

export interface ClassVideoEntry {
  contentId: string; // the id stored in the class (may differ from item.id)
  item: ContentItem;
}

interface ClassVideosTabProps {
  classVideos: ClassVideoEntry[];
  libraryVideos: ContentItem[];
  libraryLoaded: boolean;
  canManage: boolean;
  isBusy: boolean;
  onAddVideo: (videoId: string) => void;
  onRemoveVideo: (contentId: string) => void;
  onWatch: (item: ContentItem) => void;
  onVideoUpdated: (video: Video) => void;
}

export const ClassVideosTab: React.FC<ClassVideosTabProps> = ({
  classVideos,
  libraryVideos,
  libraryLoaded,
  canManage,
  isBusy,
  onAddVideo,
  onRemoveVideo,
  onWatch,
  onVideoUpdated,
}) => {
  const [search, setSearch] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // The add-video list shows only while searching: close it on a click outside the
  // search area (clicks on its "add" buttons keep it open).
  useEffect(() => {
    if (!isPickerOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isPickerOpen]);

  // Same matching as the library search: title or category contains the query.
  const query = search.trim().toLowerCase();
  const inClass = new Set(classVideos.map(({ item }) => item.video.id));
  const availableToAdd = libraryVideos.filter((item) =>
    !inClass.has(item.video.id) &&
    (!query ||
      item.video.title.toLowerCase().includes(query) ||
      item.video.categories.some((cat) => cat.toLowerCase().includes(query)))
  );

  return (
    <div className="space-y-5">
      {canManage && (
        <div
          ref={pickerRef}
          className="space-y-2"
          onKeyDown={(e) => { if (e.key === 'Escape') setIsPickerOpen(false); }}
        >
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setIsPickerOpen(true); }}
              onFocus={() => setIsPickerOpen(true)}
              placeholder="חיפוש סרטון בכל הספרייה להוספה לכיתה..."
              aria-label="חיפוש סרטון להוספה לכיתה"
              className="w-full pr-10 pl-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          {!isPickerOpen ? null : !libraryLoaded ? (
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              טוען את ספריית הסרטונים...
            </p>
          ) : availableToAdd.length === 0 ? (
            <p className="text-xs text-slate-400">
              {query ? 'לא נמצאו סרטונים תואמים בספרייה.' : 'כל סרטוני הספרייה כבר נמצאים בכיתה.'}
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
                    onClick={() => onAddVideo(item.video.id)}
                    disabled={isBusy}
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
      )}

      {classVideos.length === 0 ? (
        <p className="text-sm text-slate-400 py-6 text-center">
          {canManage ? 'עדיין לא נוספו סרטונים לכיתה. חפשו סרטון בתיבה למעלה כדי להוסיף.' : 'עדיין לא נוספו סרטונים לכיתה.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {classVideos.map(({ contentId, item }) => (
            <div key={contentId} className="relative">
              <VideoCard
                contentItem={{ ...item, id: `lib-${item.video.id}` }}
                onWatch={onWatch}
                onVideoUpdated={onVideoUpdated}
              />
              {canManage && (
                <button
                  type="button"
                  onClick={() => onRemoveVideo(contentId)}
                  disabled={isBusy}
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
      )}
    </div>
  );
};
