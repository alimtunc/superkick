import { useEffect, useReducer } from "react";
import { Link } from "react-router-dom";
import { fetchRun } from "../../api";
import { RunStateBadge } from "../RunStateBadge";
import { StepTimeline } from "../StepTimeline";
import type { Interrupt, Run, RunStep } from "../../types";
import { useWatchedSessionsCtx } from "../../context/WatchedSessionsContext";
import { fmtElapsed, TERMINAL_STATES } from "./utils";

function InterruptSummary({ interrupts }: { interrupts: Interrupt[] }) {
  const pending = interrupts.filter((i) => i.status === "pending");
  return (
    <div className="rounded border border-gold/20 bg-gold-dim p-2">
      <span className="font-data text-[10px] text-gold uppercase tracking-wider">
        {pending.length} pending interrupt{pending.length !== 1 ? "s" : ""}
      </span>
      {pending.slice(0, 2).map((int) => (
        <p key={int.id} className="font-data text-[11px] text-fog mt-1 truncate">{int.question}</p>
      ))}
    </div>
  );
}

interface PanelState {
  run: Run | null;
  steps: RunStep[];
  interrupts: Interrupt[];
  loading: boolean;
  error: string | null;
}

type PanelAction =
  | { type: "loading" }
  | { type: "loaded"; payload: { run: Run; steps: RunStep[]; interrupts: Interrupt[] } }
  | { type: "failed"; error: string };

const init: PanelState = { run: null, steps: [], interrupts: [], loading: true, error: null };

function reducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "loading": return { ...state, loading: true, error: null };
    case "loaded": return { run: action.payload.run, steps: action.payload.steps, interrupts: action.payload.interrupts, loading: false, error: null };
    case "failed": return { ...state, loading: false, error: action.error };
  }
}

export function FocusedRunPanel({ refTime }: { refTime: number }) {
  const { focusedId, focusedRun, clearFocus } = useWatchedSessionsCtx();
  const [state, dispatch] = useReducer(reducer, init);

  // Fetch full run detail when focusedId changes
  useEffect(() => {
    if (!focusedId) return;
    let cancelled = false;
    dispatch({ type: "loading" });
    fetchRun(focusedId)
      .then((data) => { if (!cancelled) dispatch({ type: "loaded", payload: data }); })
      .catch((err) => { if (!cancelled) dispatch({ type: "failed", error: String(err) }); });
    return () => { cancelled = true; };
  }, [focusedId]);

  // Auto-refresh non-terminal runs every 10s
  const runState = state.run?.state;
  useEffect(() => {
    if (!focusedId || !runState || TERMINAL_STATES.has(runState)) return;
    const id = setInterval(() => {
      fetchRun(focusedId)
        .then((data) => dispatch({ type: "loaded", payload: data }))
        .catch(() => { /* silent refresh failure */ });
    }, 10_000);
    return () => clearInterval(id);
  }, [focusedId, runState]);

  if (!focusedId || !focusedRun) return null;

  return (
    <div className="border-b border-edge bg-carbon/40">
      <div className="mx-auto max-w-[1440px] px-5 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="font-data text-[9px] uppercase tracking-widest text-dim">Focused</span>
            <h2 className="text-sm font-medium text-fog">{focusedRun.issue_identifier}</h2>
            <RunStateBadge state={focusedRun.state} />
            <span className="font-data text-[10px] text-dim">{focusedRun.repo_slug}</span>
            <span className="font-data text-[10px] text-dim">{fmtElapsed(focusedRun.started_at, refTime)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/runs/${focusedRun.id}`}
              className="font-data text-[11px] text-silver hover:text-fog border border-edge rounded px-2 py-0.5 hover:border-border transition-colors"
            >
              FULL DETAIL
            </Link>
            <button
              onClick={clearFocus}
              className="font-data text-[11px] text-dim hover:text-silver transition-colors px-1"
              title="Close panel"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Content */}
        {state.loading && !state.run ? (
          <p className="font-data text-[11px] text-dim py-2">Loading...</p>
        ) : state.error ? (
          <p className="font-data text-[11px] text-oxide py-2">{state.error}</p>
        ) : state.run ? (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4">
            {/* Left: key info */}
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <div>
                  <dt className="font-data text-[9px] uppercase tracking-wider text-dim">Branch</dt>
                  <dd className="font-data text-silver mt-0.5">{state.run.branch_name ?? "--"}</dd>
                </div>
                <div>
                  <dt className="font-data text-[9px] uppercase tracking-wider text-dim">Step</dt>
                  <dd className="font-data text-silver mt-0.5">{state.run.current_step_key ?? "--"}</dd>
                </div>
                <div>
                  <dt className="font-data text-[9px] uppercase tracking-wider text-dim">Started</dt>
                  <dd className="font-data text-silver mt-0.5">{new Date(state.run.started_at).toLocaleTimeString()}</dd>
                </div>
                <div>
                  <dt className="font-data text-[9px] uppercase tracking-wider text-dim">Trigger</dt>
                  <dd className="font-data text-silver mt-0.5">{state.run.trigger_source}</dd>
                </div>
              </dl>
              {state.run.error_message ? (
                <p className="rounded bg-oxide-dim border border-oxide/20 p-2 text-[11px] text-oxide font-data">
                  {state.run.error_message}
                </p>
              ) : null}
              {state.interrupts.length > 0 ? (
                <InterruptSummary interrupts={state.interrupts} />
              ) : null}
            </div>
            {/* Right: steps */}
            <div>
              <span className="font-data text-[9px] uppercase tracking-wider text-dim mb-2 block">Steps</span>
              <StepTimeline steps={state.steps} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
