/**
 * FocusTube - Sub-menu (tabs) inside a class.
 */

import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface ClassTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface ClassTabsProps<T extends string> {
  tabs: ClassTab<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
}

export function ClassTabs<T extends string>({ tabs, activeTab, onChange }: ClassTabsProps<T>) {
  return (
    <div role="tablist" className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
      {tabs.map(({ id, label, icon: Icon, badge }) => {
        const isActive = id === activeTab;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${
              isActive
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
            {!!badge && (
              <span
                className={`min-w-5 px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
