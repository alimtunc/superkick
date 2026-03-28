import { useCallback, useEffect, useReducer, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRun } from "../api";
import { EventStream } from "../components/EventStream";
import { InterruptPanel } from "../components/InterruptPanel";
import { ReviewResults } from "../components/ReviewResults";
import { RunStateBadge } from "../components/RunStateBadge";
import { StepTimeline } from "../components/StepTimeline";
import type { Interrupt, Run, RunStep } from "../types";
import { TERMINAL_STATES } from "../components/dashboard/utils";

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
    <p className="p-6 text-dim font-data">Run not found.</p>
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
  const showInterrupts =
    state.interrupts.length > 0 || state.run.state === "waiting_human";

  return (
    <div className="min-h-screen bg-void">
      {/* ── Top Bar ── */}
      <header className="border-b border-edge bg-carbon/90 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-4xl px-5 h-12 flex items-center justify-between">
          <Link to="/" className="font-data text-[11px] text-dim hover:text-silver transition-colors">
            &larr; CONTROL CENTER
          </Link>
          <div className="flex gap-2">
            <button
              onClick={refresh}
              className="font-data text-[11px] text-silver hover:text-fog border border-edge rounded px-2.5 py-1 hover:border-border transition-colors"
            >
              REFRESH
            </button>
            {isTerminal ? null : (
              <button
                onClick={() => setStreaming((value) => !value)}
                className={`font-data text-[11px] rounded px-2.5 py-1 border transition-colors ${
                  streaming
                    ? "border-oxide/30 bg-oxide-dim text-oxide hover:bg-oxide/20"
                    : "border-mineral/30 bg-mineral-dim text-mineral hover:bg-mineral/20"
                }`}
              >
                {streaming ? "STOP" : "WATCH LIVE"}
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-5 py-6">
        {/* ── Run Header ── */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-semibold text-fog tracking-tight">
              {state.run.issue_identifier}
            </h1>
            <RunStateBadge state={state.run.state} />
          </div>
          <p className="font-data text-[12px] text-dim">
            {state.run.repo_slug} &middot; {state.run.trigger_source}
          </p>
        </div>

        {/* ── Run Details ── */}
        <div className="panel mb-6 p-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
            <div>
              <dt className="font-data text-[10px] uppercase tracking-wider text-dim">ID</dt>
              <dd className="font-data text-silver mt-0.5 text-[11px]">{state.run.id}</dd>
            </div>
            <div>
              <dt className="font-data text-[10px] uppercase tracking-wider text-dim">State</dt>
              <dd className="text-fog mt-0.5">{state.run.state.replace(/_/g, " ")}</dd>
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
              <dt className="font-data text-[10px] uppercase tracking-wider text-dim">Finished</dt>
              <dd className="font-data text-silver mt-0.5 text-[11px]">
                {state.run.finished_at
                  ? new Date(state.run.finished_at).toLocaleString()
                  : "--"}
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
