import type { Run, RunState } from "@/types";
import { TERMINAL_STATES } from "../constants";

const ACTIVE_STATES = new Set<RunState>([
  "queued",
  "preparing",
  "planning",
  "coding",
  "running_commands",
  "reviewing",
  "waiting_human",
  "opening_pr",
]);
const IN_PROGRESS_STATES = new Set<RunState>([
  "preparing",
  "planning",
  "coding",
  "running_commands",
  "reviewing",
  "opening_pr",
]);

export interface ClassifiedRuns {
  active: Run[];
  completed: Run[];
  failed: Run[];
  cancelled: Run[];
  terminal: Run[];
  waitingHuman: Run[];
  needsAttention: Run[];
  reviewing: Run[];
  openingPr: Run[];
  inProgress: Run[];
  queued: Run[];
}

export function classifyRuns(runs: Run[]): ClassifiedRuns {
  const result: ClassifiedRuns = {
    active: [],
    completed: [],
    failed: [],
    cancelled: [],
    terminal: [],
    waitingHuman: [],
    needsAttention: [],
    reviewing: [],
    openingPr: [],
    inProgress: [],
    queued: [],
  };

  for (const r of runs) {
    if (ACTIVE_STATES.has(r.state)) result.active.push(r);
    if (TERMINAL_STATES.has(r.state)) result.terminal.push(r);
    if (IN_PROGRESS_STATES.has(r.state)) result.inProgress.push(r);

    switch (r.state) {
      case "completed":
        result.completed.push(r);
        break;
      case "failed":
        result.failed.push(r);
        result.needsAttention.push(r);
        break;
      case "cancelled":
        result.cancelled.push(r);
        break;
      case "waiting_human":
        result.waitingHuman.push(r);
        result.needsAttention.push(r);
        break;
      case "reviewing":
        result.reviewing.push(r);
        break;
      case "opening_pr":
        result.openingPr.push(r);
        break;
      case "queued":
        result.queued.push(r);
        break;
    }
  }

  return result;
}
