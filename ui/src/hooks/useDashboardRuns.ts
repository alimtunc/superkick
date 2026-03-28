import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { fetchRuns } from "../api";
import type { Run, RunState } from "../types";
import { AGING_THRESHOLD_MS, TERMINAL_STATES, elapsedMs, fmtElapsed } from "../components/dashboard/utils";

// ── State sets ──────────────────────────────────────────────────────────

const ACTIVE_STATES = new Set<RunState>([
  "queued", "preparing", "planning", "coding",
  "running_commands", "reviewing", "waiting_human", "opening_pr",
]);
const IN_PROGRESS_STATES = new Set<RunState>([
  "preparing", "planning", "coding", "running_commands", "reviewing", "opening_pr",
]);

// ── Reducer ─────────────────────────────────────────────────────────────

interface DashState {
  runs: Run[];
  loading: boolean;
  error: string | null;
  lastRefresh: Date;
}

type DashAction =
  | { type: "refresh_started" }
  | { type: "loaded"; runs: Run[] }
  | { type: "failed"; error: string };

const initial: DashState = { runs: [], loading: true, error: null, lastRefresh: new Date() };

function reducer(state: DashState, action: DashAction): DashState {
  switch (action.type) {
    case "refresh_started":
      return { ...state, loading: true, error: null };
    case "loaded":
      return { runs: action.runs, loading: false, error: null, lastRefresh: new Date() };
    case "failed":
      return { ...state, loading: false, error: action.error };
  }
}

// ── Classified runs (single pass) ───────────────────────────────────────

interface ClassifiedRuns {
  active: Run[];
  completed: Run[];
  failed: Run[];
  cancelled: Run[];
  terminal: Run[];
  waitingHuman: Run[];
  needsAttention: Run[];
  reviewing: Run[];
  openingPr: Run[];
  inProgress: Run[];
  queued: Run[];
}

function classifyRuns(runs: Run[]): ClassifiedRuns {
  const result: ClassifiedRuns = {
    active: [], completed: [], failed: [], cancelled: [],
    terminal: [], waitingHuman: [], needsAttention: [],
    reviewing: [], openingPr: [], inProgress: [], queued: [],
  };

  for (const r of runs) {
    if (ACTIVE_STATES.has(r.state)) result.active.push(r);
    if (TERMINAL_STATES.has(r.state)) result.terminal.push(r);
    if (IN_PROGRESS_STATES.has(r.state)) result.inProgress.push(r);

    switch (r.state) {
      case "completed":  result.completed.push(r); break;
      case "failed":     result.failed.push(r); result.needsAttention.push(r); break;
      case "cancelled":  result.cancelled.push(r); break;
      case "waiting_human": result.waitingHuman.push(r); result.needsAttention.push(r); break;
      case "reviewing":  result.reviewing.push(r); break;
      case "opening_pr": result.openingPr.push(r); break;
      case "queued":     result.queued.push(r); break;
    }
  }

  return result;
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useDashboardRuns() {
  const [state, dispatch] = useReducer(reducer, initial);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    dispatch({ type: "refresh_started" });
    setTick((v) => v + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const runs = await fetchRuns();
        if (!cancelled) dispatch({ type: "loaded", runs });
      } catch (err) {
        if (!cancelled) dispatch({ type: "failed", error: String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const { runs, loading, error, lastRefresh } = state;
  const refTime = useMemo(() => lastRefresh.getTime(), [lastRefresh]);

  const classified = useMemo(() => classifyRuns(runs), [runs]);

  const successRate = classified.terminal.length > 0
    ? Math.round((classified.completed.length / classified.terminal.length) * 100)
    : null;

  const aging = useMemo(() => classified.active.filter((r) =>
    elapsedMs(r.started_at, refTime) > AGING_THRESHOLD_MS
    && r.state !== "waiting_human" && r.state !== "failed"
  ), [classified.active, refTime]);

  const oldestActive = useMemo(() => {
    if (classified.active.length === 0) return "--";
    const oldest = classified.active.reduce((a, b) =>
      new Date(a.started_at).getTime() < new Date(b.started_at).getTime() ? a : b
    );
    return fmtElapsed(oldest.started_at, refTime);
  }, [classified.active, refTime]);

  return {
    runs,
    loading,
    error,
    lastRefresh,
    refTime,
    refresh,
    ...classified,
    successRate,
    aging,
    oldestActive,
  };
}
