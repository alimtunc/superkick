import type { RunState } from "../types";

const styles: Record<RunState, string> = {
  queued: "text-dim bg-dim/10",
  preparing: "text-cyan bg-cyan-dim",
  planning: "text-cyan bg-cyan-dim",
  coding: "text-neon-green bg-mineral-dim",
  running_commands: "text-neon-green bg-mineral-dim",
  reviewing: "text-violet bg-violet-dim",
  waiting_human: "text-gold bg-gold-dim",
  opening_pr: "text-mineral bg-mineral-dim",
  completed: "text-mineral bg-mineral-dim",
  failed: "text-oxide bg-oxide-dim",
  cancelled: "text-dim bg-dim/10",
};

export function RunStateBadge({ state }: { state: RunState }) {
  return (
    <span className={`inline-block font-data rounded px-2 py-0.5 text-[10px] font-medium ${styles[state]}`}>
      {state.replace(/_/g, " ")}
    </span>
  );
}
