import { useCallback, useEffect, useReducer, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cancelRun, fetchRun } from "../api";
import { EventStream } from "../components/EventStream";
import { InterruptPanel } from "../components/InterruptPanel";
import { ReviewResults } from "../components/ReviewResults";
import { RunStateBadge } from "../components/RunStateBadge";
import { SessionWatchRail } from "../components/dashboard/RunBoard";
import { StepTimeline } from "../components/StepTimeline";
import type { Interrupt, Run, RunStep } from "../types";
import { TERMINAL_STATES, shouldShowInterrupts } from "../components/dashboard/utils";
import { useWatchedSessionsCtx } from "../context/WatchedSessionsContext";

interface RunDetailProps {
  runId: string;
  refTime: number;
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

export function RunDetailRoute({ refTime }: { refTime: number }) {
  const { id } = useParams<{ id: string }>();

  return id ? (
    <RunDetail key={id} runId={id} refTime={refTime} />
  ) : (
    <p className="p-6 text-dim font-data">Run not found.</p>
  );
}

export function RunDetail({ runId, refTime }: RunDetailProps) {
  const [state, dispatch] = useReducer(runDetailReducer, initialState);
  const [streaming, setStreaming] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const { isWatched, toggleWatch, maxReached } = useWatchedSessionsCtx();
  const watched = isWatched(runId);

  const refresh = useCallback(() => {
    dispatch({ type: "refresh_started" });
    setRefreshTick((value) => value + 1);
  }, []);

  const syncRun = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    try {
      await cancelRun(runId);
      setCancelConfirm(false);
      setStreaming(false);
      syncRun();
    } catch {
      setCancelConfirm(false);
    } finally {
      setCancelling(false);
    }
  }, [runId, syncRun]);

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

  // Reset cancel confirm when clicking elsewhere
  useEffect(() => {
    if (!cancelConfirm) return;
    const timer = setTimeout(() => setCancelConfirm(false), 4000);
    return () => clearTimeout(timer);
  }, [cancelConfirm]);

  if (state.loading) {
    return <p className="p-6 text-dim font-data">Loading...</p>;
  }
  if (state.error) {
    return <p className="p-6 text-oxide font-data">{state.error}</p>;
  }
  if (!state.run) {
    return <p className="p-6 text-dim font-data">Run not found.</p>;
  }

  const isTerminal = TERMINAL_STATES.has(state.run.state);
  const showInterrupts = shouldShowInterrupts(state.run.state, state.interrupts.length);

  return (
    <div className="min-h-screen bg-void">
      {/* ── Top Bar ── */}
      <header className="border-b border-edge bg-carbon/90 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-4xl px-5 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="font-data text-[11px] text-dim hover:text-silver transition-colors">
              &larr; CONTROL CENTER
            </Link>
            <span className="text-edge">|</span>
            <span className="font-data text-[11px] text-fog font-medium">{state.run.issue_identifier}</span>
            <RunStateBadge state={state.run.state} />
          </div>

          <div className="flex items-center gap-1.5">
            {/* ── Observation actions ── */}
            <button
              onClick={() => toggleWatch(runId)}
              disabled={!watched && maxReached}
              className={`font-data text-[11px] rounded px-2.5 py-1 border transition-colors ${
                watched
                  ? "border-mineral/30 bg-mineral-dim text-mineral hover:bg-mineral/20"
                  : maxReached
                    ? "border-edge text-dim/30 cursor-not-allowed"
                    : "border-edge text-dim hover:text-silver hover:border-border"
              }`}
              title={watched ? "Remove from watch rail" : maxReached ? "Max 5 watched" : "Pin to watch rail"}
            >
              {watched ? "◉ PINNED" : "○ PIN"}
            </button>

            {isTerminal ? null : (
              <button
                onClick={() => setStreaming((v) => !v)}
                className={`font-data text-[11px] rounded px-2.5 py-1 border transition-colors ${
                  streaming
                    ? "border-neon-green/30 bg-mineral-dim text-neon-green hover:bg-mineral/20"
                    : "border-edge text-dim hover:text-silver hover:border-border"
                }`}
              >
                {streaming ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-neon-green live-pulse" />
                    LIVE
                  </span>
                ) : "LIVE"}
              </button>
            )}

            <button
              onClick={refresh}
              className="font-data text-[11px] text-dim hover:text-silver border border-edge rounded px-2.5 py-1 hover:border-border transition-colors"
            >
              REFRESH
            </button>

            {/* ── Separator ── */}
            {isTerminal ? null : (
              <>
                <span className="w-px h-5 bg-edge mx-1" />
                {/* ── Destructive actions ── */}
                {cancelConfirm ? (
                  <div className="flex items-center gap-1">
                    <span className="font-data text-[10px] text-oxide">Cancel this run?</span>
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="font-data text-[11px] rounded px-2 py-1 border border-oxide/40 bg-oxide-dim text-oxide hover:bg-oxide/20 transition-colors disabled:opacity-50"
                    >
                      {cancelling ? "..." : "CONFIRM"}
                    </button>
                    <button
                      onClick={() => setCancelConfirm(false)}
                      className="font-data text-[11px] text-dim hover:text-silver px-1 transition-colors"
                    >
                      &times;
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCancelConfirm(true)}
                    className="font-data text-[11px] rounded px-2.5 py-1 border border-edge text-dim hover:text-oxide hover:border-oxide/30 transition-colors"
                  >
                    CANCEL RUN
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <SessionWatchRail refTime={refTime} mode="detail" />

      <div className="mx-auto max-w-4xl px-5 py-6">
        {/* ── Run Details ── */}
        <div className="panel mb-6 p-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
            <div>
              <dt className="font-data text-[10px] uppercase tracking-wider text-dim">ID</dt>
              <dd className="font-data text-silver mt-0.5 text-[11px]">{state.run.id}</dd>
            </div>
            <div>
              <dt className="font-data text-[10px] uppercase tracking-wider text-dim">Repo</dt>
              <dd className="font-data text-silver mt-0.5 text-[11px]">{state.run.repo_slug}</dd>
            </div>
            <div>
              <dt className="font-data text-[10px] uppercase tracking-wider text-dim">Branch</dt>
              <dd className="font-data text-silver mt-0.5 text-[11px]">{state.run.branch_name ?? "--"}</dd>
            </div>
            <div>
              <dt className="font-data text-[10px] uppercase tracking-wider text-dim">Step</dt>
              <dd className="font-data text-silver mt-0.5 text-[11px]">{state.run.current_step_key ?? "--"}</dd>
            </div>
            <div>
              <dt className="font-data text-[10px] uppercase tracking-wider text-dim">Started</dt>
              <dd className="font-data text-silver mt-0.5 text-[11px]">
                {new Date(state.run.started_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="font-data text-[10px] uppercase tracking-wider text-dim">
                {state.run.finished_at ? "Finished" : "Trigger"}
              </dt>
              <dd className="font-data text-silver mt-0.5 text-[11px]">
                {state.run.finished_at
                  ? new Date(state.run.finished_at).toLocaleString()
                  : state.run.trigger_source}
              </dd>
            </div>
          </dl>
          {state.run.error_message ? (
            <p className="mt-3 rounded bg-oxide-dim border border-oxide/20 p-2 text-[12px] text-oxide font-data">
              {state.run.error_message}
            </p>
          ) : null}
        </div>

        <section className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="font-data text-[11px] font-medium uppercase tracking-widest text-silver">Steps</h2>
            <div className="flex-1 h-px bg-edge" />
          </div>
          <StepTimeline steps={state.steps} />
        </section>

        <ReviewResults steps={state.steps} />

        {showInterrupts ? (
          <section className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-data text-[11px] font-medium uppercase tracking-widest text-gold">Interrupts</h2>
              <div className="flex-1 h-px bg-edge" />
            </div>
            <InterruptPanel
              runId={state.run.id}
              interrupts={state.interrupts}
              onAnswered={syncRun}
            />
          </section>
        ) : null}

        <section>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="font-data text-[11px] font-medium uppercase tracking-widest text-silver">Events</h2>
            <div className="flex-1 h-px bg-edge" />
          </div>
          <EventStream runId={state.run.id} active={streaming} onStateChange={syncRun} />
        </section>
      </div>
    </div>
  );
}
