import { useCallback, useEffect, useMemo, useState } from "react";
import type { Run } from "../types";

const STORAGE_KEY = "superkick:watched-sessions";
const MAX_WATCHED = 5;

interface WatchedState {
  ids: string[];
  focusedId: string | null;
}

function loadFromStorage(): WatchedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ids: [], focusedId: null };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.ids)) return { ids: parsed.ids.slice(0, MAX_WATCHED), focusedId: parsed.focusedId ?? null };
  } catch { /* ignore corrupt storage */ }
  return { ids: [], focusedId: null };
}

function saveToStorage(state: WatchedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useWatchedSessions(allRuns: Run[]) {
  const [state, setState] = useState<WatchedState>(loadFromStorage);

  // Persist on every change
  useEffect(() => { saveToStorage(state); }, [state]);

  // Build a lookup map for fast access
  const runsById = useMemo(() => {
    const map = new Map<string, Run>();
    for (const r of allRuns) map.set(r.id, r);
    return map;
  }, [allRuns]);

  // Resolve watched runs (filter out runs that no longer exist)
  const watchedRuns = useMemo(() => {
    const result: Run[] = [];
    for (const id of state.ids) {
      const run = runsById.get(id);
      if (run) result.push(run);
    }
    return result;
  }, [state.ids, runsById]);

  const focusedRun = state.focusedId ? runsById.get(state.focusedId) ?? null : null;

  const isWatched = useCallback((runId: string) => state.ids.includes(runId), [state.ids]);

  const watch = useCallback((runId: string) => {
    setState((prev) => {
      if (prev.ids.includes(runId)) return prev;
      const next = [runId, ...prev.ids].slice(0, MAX_WATCHED);
      return { ids: next, focusedId: runId };
    });
  }, []);

  const unwatch = useCallback((runId: string) => {
    setState((prev) => {
      const next = prev.ids.filter((id) => id !== runId);
      const focusedId = prev.focusedId === runId ? null : prev.focusedId;
      return { ids: next, focusedId };
    });
  }, []);

  const toggleWatch = useCallback((runId: string) => {
    setState((prev) => {
      if (prev.ids.includes(runId)) {
        const next = prev.ids.filter((id) => id !== runId);
        return { ids: next, focusedId: prev.focusedId === runId ? null : prev.focusedId };
      }
      const next = [runId, ...prev.ids].slice(0, MAX_WATCHED);
      return { ids: next, focusedId: runId };
    });
  }, []);

  const focus = useCallback((runId: string) => {
    setState((prev) => {
      // Auto-watch if not already watched
      const ids = prev.ids.includes(runId) ? prev.ids : [runId, ...prev.ids].slice(0, MAX_WATCHED);
      return { ids, focusedId: runId };
    });
  }, []);

  const clearFocus = useCallback(() => {
    setState((prev) => ({ ...prev, focusedId: null }));
  }, []);

  return {
    watchedIds: state.ids,
    watchedRuns,
    focusedId: state.focusedId,
    focusedRun,
    isWatched,
    watch,
    unwatch,
    toggleWatch,
    focus,
    clearFocus,
    maxReached: state.ids.length >= MAX_WATCHED,
  };
}

export type WatchedSessionsAPI = ReturnType<typeof useWatchedSessions>;
