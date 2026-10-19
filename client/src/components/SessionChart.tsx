/**
 * FocusTube - Session Concentration Chart
 * Clean SVG-based concentration timeline (0.0 - 1.0) with pause event indicators
 */

import React from 'react';
import { SessionReading, PauseEvent } from '../types';

interface SessionChartProps {
  readings: SessionReading[];
  pauseEvents?: PauseEvent[];
  threshold?: number; // Default 0.6
}

export const SessionChart: React.FC<SessionChartProps> = ({
  readings,
  pauseEvents = [],
  threshold = 0.6,
}) => {
  if (!readings || readings.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center bg-slate-950/60 rounded-2xl border border-slate-800 text-slate-500 text-sm">
        <p>אין נתוני מדידת ריכוז זמינים עבור סשן זה</p>
      </div>
    );
  }

  const width = 800;
  const height = 260;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // X range: position in seconds
  const minX = 0;
  const maxX = Math.max(readings[readings.length - 1]?.position_seconds || 60, 60);

  // Helper coordinate converters
  const getX = (seconds: number) => {
    return padding.left + (seconds / maxX) * chartWidth;
  };

  const getY = (score: number) => {
    // 0 is bottom, 1 is top
    return padding.top + (1 - score) * chartHeight;
  };

  // Build SVG path
  const points = readings.map((r) => `${getX(r.position_seconds)},${getY(r.score)}`);
  const pathD = `M ${points.join(' L ')}`;
  const areaD = `M ${getX(readings[0].position_seconds)},${getY(0)} L ${points.join(' L ')} L ${getX(readings[readings.length - 1].position_seconds)},${getY(0)} Z`;

  const thresholdY = getY(threshold);

  return (
    <div className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-inner">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />
            <span className="text-slate-300 font-medium">ציון ריכוז מוחלק (0–1)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 border-t border-dashed border-rose-500 inline-block" />
            <span className="text-rose-400 font-medium">סף עצירה (0.6)</span>
          </div>
          {pauseEvents.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-300 inline-block" />
              <span className="text-amber-300 font-medium">אירועי עצירת סרטון ({pauseEvents.length})</span>
            </div>
          )}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[600px]">
          <defs>
            <linearGradient id="concGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((val) => {
            const y = getY(val);
            return (
              <g key={val}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[10px] font-mono"
                >
                  {val.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Threshold line (0.6) */}
          <line
            x1={padding.left}
            y1={thresholdY}
            x2={width - padding.right}
            y2={thresholdY}
            stroke="#f43f5e"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Filled area */}
          <path d={areaD} fill="url(#concGradient)" />

          {/* Concentration curve */}
          <path
            d={pathD}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Pause Event Markers */}
          {pauseEvents.map((pe, idx) => {
            const px = getX(pe.position_seconds);
            const isCorrect = pe.is_correct === true;
            const markerColor = isCorrect ? '#10b981' : '#f59e0b';
            return (
              <g key={idx}>
                <line
                  x1={px}
                  y1={padding.top}
                  x2={px}
                  y2={height - padding.bottom}
                  stroke={markerColor}
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                  opacity="0.8"
                />
                <circle
                  cx={px}
                  cy={padding.top + 8}
                  r="5"
                  fill={markerColor}
                  stroke="#0f172a"
                  strokeWidth="2"
                />
              </g>
            );
          })}

          {/* X axis labels (seconds/minutes) */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
            const sec = Math.round(maxX * ratio);
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            const label = `${m}:${s < 10 ? '0' : ''}${s}`;
            const x = padding.left + ratio * chartWidth;
            return (
              <text
                key={ratio}
                x={x}
                y={height - padding.bottom + 20}
                textAnchor="middle"
                className="fill-slate-500 text-[11px] font-mono"
              >
                {label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
