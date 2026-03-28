import { useState } from "react";
import type { Interrupt, InterruptAction } from "../types";
import { answerInterrupt } from "../api";

interface InterruptPanelProps {
  runId: string;
  interrupts: Interrupt[];
  onAnswered: () => void;
}

export function InterruptPanel({ runId, interrupts, onAnswered }: InterruptPanelProps) {
  const pending = interrupts.filter((i) => i.status === "pending");
  const resolved = interrupts.filter((i) => i.status !== "pending");

  return (
    <div className="space-y-4">
      {pending.map((interrupt) => (
        <PendingInterrupt
          key={interrupt.id}
          runId={runId}
          interrupt={interrupt}
          onAnswered={onAnswered}
        />
      ))}

      {resolved.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-400">History</h3>
          {resolved.map((interrupt) => (
            <ResolvedInterrupt key={interrupt.id} interrupt={interrupt} />
          ))}
        </div>
      ) : null}

      {interrupts.length === 0 ? (
        <p className="text-sm text-slate-500">No interrupts.</p>
      ) : null}
    </div>
  );
}

function PendingInterrupt({
  runId,
  interrupt,
  onAnswered,
}: {
  runId: string;
  interrupt: Interrupt;
  onAnswered: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const submit = async (action: InterruptAction) => {
    setSubmitting(true);
    setError(null);
    try {
      await answerInterrupt(runId, interrupt.id, action);
      onAnswered();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-yellow-700 bg-yellow-900/20 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-yellow-400 text-lg">!</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-yellow-200">{interrupt.question}</p>
          <p className="text-xs text-slate-500 mt-1">
            {new Date(interrupt.created_at).toLocaleString()}
          </p>

          {error ? (
            <p className="mt-2 text-sm text-red-400 bg-red-900/30 rounded p-2">{error}</p>
          ) : null}

          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <button
                disabled={submitting}
                onClick={() => submit({ action: "retry_step" })}
                className="px-3 py-1.5 text-sm rounded bg-blue-800 hover:bg-blue-700 text-blue-200 transition-colors disabled:opacity-50"
              >
                Retry Step
              </button>
              <button
                disabled={submitting}
                onClick={() => submit({ action: "abort_run" })}
                className="px-3 py-1.5 text-sm rounded bg-red-800 hover:bg-red-700 text-red-200 transition-colors disabled:opacity-50"
              >
                Abort Run
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note and continue..."
                className="flex-1 px-3 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-400"
              />
              <button
                disabled={submitting || !note.trim()}
                onClick={() => submit({ action: "continue_with_note", note: note.trim() })}
                className="px-3 py-1.5 text-sm rounded bg-green-800 hover:bg-green-700 text-green-200 transition-colors disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResolvedInterrupt({ interrupt }: { interrupt: Interrupt }) {
  const answer = interrupt.answer_json as { action?: string; note?: string } | null;
  const actionLabel = answer?.action?.replace(/_/g, " ") ?? interrupt.status;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-slate-500 text-lg">
          {interrupt.status === "resolved" ? "\u2713" : "\u2014"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-400">{interrupt.question}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
              {actionLabel}
            </span>
            {answer?.note ? (
              <span className="text-xs text-slate-500 italic">"{answer.note}"</span>
            ) : null}
            {interrupt.resolved_at ? (
              <span className="text-xs text-slate-600">
                {new Date(interrupt.resolved_at).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
