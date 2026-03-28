import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import type { Run, RunStep, Interrupt } from "../types";
import { fetchRun } from "../api";
import { RunStateBadge } from "../components/RunStateBadge";
import { StepTimeline } from "../components/StepTimeline";
import { EventStream } from "../components/EventStream";
import { InterruptPanel } from "../components/InterruptPanel";
import { ReviewResults } from "../components/ReviewResults";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [interrupts, setInterrupts] = useState<Interrupt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetchRun(id)
      .then(({ run, steps, interrupts }) => {
        setRun(run);
        setSteps(steps);
        setInterrupts(interrupts);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  // Auto-refresh run data on state changes / interrupts via SSE.
  useEffect(() => {
    if (!id) return;
    const es = new EventSource(`/api/runs/${id}/events`);
    es.addEventListener("run_event", (e) => {
      const data = JSON.parse(e.data);
      if (data.kind === "state_change" || data.kind === "interrupt_created") {
        load();
      }
    });
    es.addEventListener("done", () => es.close());
    es.onerror = () => es.close();
    return () => es.close();
  }, [id, load]);

  if (loading) return <p className="p-6 text-slate-400">Loading…</p>;
  if (error) return <p className="p-6 text-red-400">{error}</p>;
  if (!run) return <p className="p-6 text-slate-400">Run not found.</p>;

  const isTerminal = TERMINAL.has(run.state);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-4">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">
          &larr; All runs
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            {run.issue_identifier}
            <RunStateBadge state={run.state} />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {run.repo_slug} &middot; {run.trigger_source}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="px-3 py-1.5 text-sm rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            Refresh
          </button>
          {!isTerminal && (
            <button
              onClick={() => setStreaming((s) => !s)}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                streaming
                  ? "bg-red-800 hover:bg-red-700 text-red-200"
                  : "bg-blue-800 hover:bg-blue-700 text-blue-200"
              }`}
            >
              {streaming ? "Stop" : "Watch Live"}
            </button>
          )}
        </div>
      </div>

      {/* Run metadata */}
      <div className="rounded-lg bg-slate-800 border border-slate-700 p-4 mb-6">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-slate-500">ID</dt>
            <dd className="font-mono text-slate-300 text-xs">{run.id}</dd>
          </div>
          <div>
            <dt className="text-slate-500">State</dt>
            <dd>{run.state}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Branch</dt>
            <dd className="font-mono text-slate-300">{run.branch_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Current step</dt>
            <dd className="font-mono text-slate-300">{run.current_step_key ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Started</dt>
            <dd className="text-slate-300">{new Date(run.started_at).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Finished</dt>
            <dd className="text-slate-300">
              {run.finished_at ? new Date(run.finished_at).toLocaleString() : "—"}
            </dd>
          </div>
        </dl>
        {run.error_message && (
          <p className="mt-3 text-sm text-red-400 bg-red-900/30 rounded p-2">
            {run.error_message}
          </p>
        )}
      </div>

      {/* Step timeline */}
      <section className="mb-6">
        <h2 className="text-lg font-semibold text-white mb-3">Steps</h2>
        <StepTimeline steps={steps} />
      </section>

      {/* Review results */}
      <ReviewResults steps={steps} />

      {/* Interrupts */}
      {(interrupts.length > 0 || run.state === "waiting_human") && (
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">Interrupts</h2>
          <InterruptPanel runId={run.id} interrupts={interrupts} onAnswered={load} />
        </section>
      )}

      {/* Event stream */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Events</h2>
        <EventStream runId={run.id} active={streaming} />
      </section>
    </div>
  );
}
