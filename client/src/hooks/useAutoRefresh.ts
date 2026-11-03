/**
 * FocusTube - silent auto-refresh (polling + refetch when the user returns to the tab),
 * so changes made by other users show up without a manual reload.
 */

import { useEffect, useRef } from 'react';

export const REFRESH_INTERVAL_MS = 5000;

// visibilitychange and focus usually fire together when returning to the tab.
const RETURN_DEBOUNCE_MS = 1000;

interface AutoRefreshOptions {
  intervalMs?: number;
  enabled?: boolean;
}

export function useAutoRefresh(
  refresh: () => Promise<unknown> | void,
  { intervalMs = REFRESH_INTERVAL_MS, enabled = true }: AutoRefreshOptions = {}
): void {
  // Always call the latest refresh so it never sees stale state.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;

    let running = false;
    let lastStartedAt = 0;

    const run = async () => {
      if (document.hidden || running) return;
      running = true;
      lastStartedAt = Date.now();
      try {
        await refreshRef.current();
      } catch {
        // Transient failure: the next tick retries.
      } finally {
        running = false;
      }
    };

    const handleReturn = () => {
      if (document.hidden || Date.now() - lastStartedAt < RETURN_DEBOUNCE_MS) return;
      void run();
    };

    const intervalId = window.setInterval(run, intervalMs);
    document.addEventListener('visibilitychange', handleReturn);
    window.addEventListener('focus', handleReturn);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleReturn);
      window.removeEventListener('focus', handleReturn);
    };
  }, [intervalMs, enabled]);
}

// Keeps the previous value when the data did not change, so React skips the re-render.
export function keepIfSame<T>(prev: T, next: T): T {
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}
