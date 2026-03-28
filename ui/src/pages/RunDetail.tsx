import { useCallback, useEffect, useReducer, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRun, subscribeToRunEvents } from "../api";
import { EventStream } from "../components/EventStream";
import { InterruptPanel } from "../components/InterruptPanel";
import { ReviewResults } from "../components/ReviewResults";
import { RunStateBadge } from "../components/RunStateBadge";
import { StepTimeline } from "../components/StepTimeline";
import type { Interrupt, Run, RunStep } from "../types";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

interface RunDetailProps {
  runId: string;
}

interface RunDetailState {
  run: Run | null;
  steps: RunStep[];
  interrupts: Interrupt[];
  loading: boolean;
  error: string | null;
}

type RunDetailAction =
  | { type: "refresh_started" }
  | { type: "loaded"; payload: { run: Run; steps: RunStep[]; interrupts: Interrupt[] } }
  | { type: "failed"; error: string };

const initialState: RunDetailState = {
  run: null,
  steps: [],
  interrupts: [],
  loading: true,
  error: null,
};

function runDetailReducer(state: RunDetailState, action: RunDetailAction): RunDetailState {
  switch (action.type) {
    case "refresh_started":
      return { ...state, loading: true, error: null };
    case "loaded":
      return {
        run: action.payload.run,
        steps: action.payload.steps,
        interrupts: action.payload.interrupts,
        loading: false,
        error: null,
      };
    case "failed":
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

export function RunDetailRoute() {
  const { id } = useParams<{ id: string }>();

  return id ? (
    <RunDetail key={id} runId={id} />
  ) : (
    <p className="p-6 text-slate-400">Run not found.</p>
  );
}

export function RunDetail({ runId }: RunDetailProps) {
  const [state, dispatch] = useReducer(runDetailReducer, initialState);
  const [streaming, setStreaming] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    dispatch({ type: "refresh_started" });
    setRefreshTick((value) => value + 1);
  }, []);

  const syncRun = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRun = async () => {
      try {
        const next = await fetchRun(runId);
        if (!cancelled) {
          dispatch({ type: "loaded", payload: next });
        }
      } catch (err) {
        if (!cancelled) {
          dispatch({ type: "failed", error: String(err) });
        }
      }
    };

    void loadRun();

    return () => {
      cancelled = true;
    };
  }, [refreshTick, runId]);

  useEffect(() => {
    return subscribeToRunEvents(
      runId,
      (event) => {
        if (event.kind === "state_change" || event.kind === "interrupt_created") {
          syncRun();
        }
      },
      () => {},
      () => {},
    );
  }, [runId, syncRun]);

  if (state.loading) {
    return <p className="p-6 text-slate-400">Loading…</p>;
  }
  if (state.error) {
    return <p className="p-6 text-red-400">{state.error}</p>;
  }
  if (!state.run) {
    return <p className="p-6 text-slate-400">Run not found.</p>;
  }

  const isTerminal = TERMINAL.has(state.run.state);
  const showInterrupts =
    state.interrupts.length > 0 || state.run.state === "waiting_human";

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4">
        <Link to="/" className="text-sm text-slate-400 transition-colors hover:text-slate-200">
          &larr; All runs
        </Link>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
            {state.run.issue_identifier}
            <RunStateBadge state={state.run.state} />
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {state.run.repo_slug} &middot; {state.run.trigger_source}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="rounded bg-slate-700 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-600"
          >
            Refresh
          </button>
          {isTerminal ? null : (
            <button
              onClick={() => setStreaming((value) => !value)}
              className={`rounded px-3 py-1.5 text-sm transition-colors ${
                streaming
                  ? "bg-red-800 text-red-200 hover:bg-red-700"
                  : "bg-blue-800 text-blue-200 hover:bg-blue-700"
              }`}
            >
              {streaming ? "Stop" : "Watch Live"}
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-slate-500">ID</dt>
            <dd className="font-mono text-xs text-slate-300">{state.run.id}</dd>
          </div>
          <div>
            <dt className="text-slate-500">State</dt>
            <dd>{state.run.state}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Branch</dt>
            <dd className="font-mono text-slate-300">{state.run.branch_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Current step</dt>
            <dd className="font-mono text-slate-300">{state.run.current_step_key ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Started</dt>
            <dd className="text-slate-300">
              {new Date(state.run.started_at).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Finished</dt>
            <dd className="text-slate-300">
              {state.run.finished_at
                ? new Date(state.run.finished_at).toLocaleString()
                : "—"}
            </dd>
          </div>
        </dl>
        {state.run.error_message ? (
          <p className="mt-3 rounded bg-red-900/30 p-2 text-sm text-red-400">
            {state.run.error_message}
          </p>
        ) : null}
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-white">Steps</h2>
        <StepTimeline steps={state.steps} />
      </section>

      <ReviewResults steps={state.steps} />

      {showInterrupts ? (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-white">Interrupts</h2>
          <InterruptPanel
            runId={state.run.id}
            interrupts={state.interrupts}
            onAnswered={syncRun}
          />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Events</h2>
        <EventStream runId={state.run.id} active={streaming} />
      </section>
    </div>
  );
}
