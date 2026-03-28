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
    <div className="space-y-3">
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
          <h3 className="font-data text-[10px] uppercase tracking-wider text-dim">History</h3>
          {resolved.map((interrupt) => (
            <ResolvedInterrupt key={interrupt.id} interrupt={interrupt} />
          ))}
        </div>
      ) : null}

      {interrupts.length === 0 ? (
        <p className="text-sm font-data text-dim">No interrupts.</p>
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
    <div className="panel glow-gold border-l-2 border-l-gold p-4">
      <div className="flex items-start gap-3">
        <span className="font-data text-gold text-base mt-0.5">!!</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-fog">{interrupt.question}</p>
          <p className="font-data text-[10px] text-dim mt-1">
            {new Date(interrupt.created_at).toLocaleString()}
          </p>

          {error ? (
            <p className="mt-2 text-[12px] text-oxide bg-oxide-dim rounded p-2 font-data">{error}</p>
          ) : null}

          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <button
                disabled={submitting}
                onClick={() => submit({ action: "retry_step" })}
                className="font-data text-[11px] rounded border border-cyan/30 bg-cyan-dim text-cyan px-2.5 py-1 hover:bg-cyan/20 transition-colors disabled:opacity-40"
              >
                RETRY
              </button>
              <button
                disabled={submitting}
                onClick={() => submit({ action: "abort_run" })}
                className="font-data text-[11px] rounded border border-oxide/30 bg-oxide-dim text-oxide px-2.5 py-1 hover:bg-oxide/20 transition-colors disabled:opacity-40"
              >
                ABORT
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note and continue..."
                className="flex-1 px-2.5 py-1 text-[12px] rounded border border-edge bg-carbon text-fog placeholder-dim focus:outline-none focus:border-border font-data"
              />
              <button
                disabled={submitting || !note.trim()}
                onClick={() => submit({ action: "continue_with_note", note: note.trim() })}
                className="font-data text-[11px] rounded border border-mineral/30 bg-mineral-dim text-mineral px-2.5 py-1 hover:bg-mineral/20 transition-colors disabled:opacity-40"
              >
                CONTINUE
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
    <div className="panel p-3">
      <div className="flex items-start gap-3">
        <span className="font-data text-dim text-base mt-0.5">
          {interrupt.status === "resolved" ? "\u2713" : "\u2014"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] text-silver">{interrupt.question}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-data text-[10px] px-1.5 py-0.5 rounded bg-edge text-ash">
              {actionLabel}
            </span>
            {answer?.note ? (
              <span className="text-[11px] text-dim italic">"{answer.note}"</span>
            ) : null}
            {interrupt.resolved_at ? (
              <span className="font-data text-[10px] text-dim">
                {new Date(interrupt.resolved_at).toLocaleString()}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
