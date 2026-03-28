import type { RunState } from "@/types";
import { stateBadgeStyle } from "@/lib/domain";

export function RunStateBadge({ state }: { state: RunState }) {
  return (
    <span
      className={`inline-block font-data rounded px-2 py-0.5 text-[10px] font-medium ${stateBadgeStyle[state]}`}
    >
      {state.replace(/_/g, " ")}
    </span>
  );
}
