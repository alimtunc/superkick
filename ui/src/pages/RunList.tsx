import { useCallback, useEffect, useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRuns } from "../api";
import { RunStateBadge } from "../components/RunStateBadge";
import type { Run } from "../types";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

interface RunListState {
  runs: Run[];
  loading: boolean;
  error: string | null;
}

type RunListAction =
  | { type: "refresh_started" }
  | { type: "loaded"; runs: Run[] }
  | { type: "failed"; error: string };

const initialState: RunListState = {
  runs: [],
  loading: true,
  error: null,
};

function runListReducer(state: RunListState, action: RunListAction): RunListState {
  switch (action.type) {
    case "refresh_started":
      return { ...state, loading: true, error: null };
    case "loaded":
      return { runs: action.runs, loading: false, error: null };
    case "failed":
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

export function RunList() {
  const [state, dispatch] = useReducer(runListReducer, initialState);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    dispatch({ type: "refresh_started" });
    setRefreshTick((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRuns = async () => {
      try {
        const nextRuns = await fetchRuns();
        if (!cancelled) {
          dispatch({ type: "loaded", runs: nextRuns });
        }
      } catch (err) {
        if (!cancelled) {
          dispatch({ type: "failed", error: String(err) });
        }
      }
    };

    void loadRuns();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Runs</h1>
        <button
          onClick={refresh}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-600"
        >
          Refresh
        </button>
      </div>

      {state.loading ? <p className="text-slate-400">Loading…</p> : null}
      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}

      {!state.loading && state.runs.length === 0 && !state.error ? (
        <p className="text-slate-500">No runs yet.</p>
      ) : null}

      <div className="space-y-2">
        {state.runs.map((run) => (
          <Link
            key={run.id}
            to={`/runs/${run.id}`}
            className="block rounded-lg border border-slate-700 bg-slate-800 p-4 transition-colors hover:bg-slate-700"
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-sm text-white">{run.issue_identifier}</span>
              <RunStateBadge state={run.state} />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span>{run.repo_slug}</span>
              {run.current_step_key ? <span>step: {run.current_step_key}</span> : null}
              {!TERMINAL.has(run.state) ? (
                <span className="text-blue-400">in progress</span>
              ) : null}
              <span className="ml-auto">{new Date(run.started_at).toLocaleString()}</span>
            </div>
            {run.error_message ? (
              <p className="mt-2 truncate text-xs text-red-400">{run.error_message}</p>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
