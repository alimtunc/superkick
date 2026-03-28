import type { Run, RunState } from "@/types";
import { HEALTH_WARNING_THRESHOLD_MS } from "../constants";
import { elapsedMs } from "./formatters";

export function healthSignal(run: Run, refTime: number): "critical" | "warning" | "ok" {
  if (run.state === "waiting_human" || run.state === "failed") return "critical";
  if (elapsedMs(run.started_at, refTime) > HEALTH_WARNING_THRESHOLD_MS) return "warning";
  return "ok";
}

export function shouldShowInterrupts(state: RunState, interruptCount: number): boolean {
  return interruptCount > 0 || state === "waiting_human";
}
