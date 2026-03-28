import type { RunState } from "../types";

const colors: Record<RunState, string> = {
  queued: "bg-gray-600 text-gray-200",
  preparing: "bg-blue-800 text-blue-200",
  planning: "bg-indigo-800 text-indigo-200",
  coding: "bg-violet-800 text-violet-200",
  running_commands: "bg-purple-800 text-purple-200",
  reviewing: "bg-cyan-800 text-cyan-200",
  waiting_human: "bg-yellow-800 text-yellow-200",
  opening_pr: "bg-teal-800 text-teal-200",
  completed: "bg-green-800 text-green-200",
  failed: "bg-red-800 text-red-200",
  cancelled: "bg-gray-700 text-gray-300",
};

export function RunStateBadge({ state }: { state: RunState }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[state]}`}>
      {state.replace(/_/g, " ")}
    </span>
  );
}
