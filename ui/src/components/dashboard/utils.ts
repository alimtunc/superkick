import type { Run, RunState } from "../../types";

// ── State sets ──────────────────────────────────────────────────────────

export const TERMINAL_STATES = new Set<RunState>(["completed", "failed", "cancelled"]);

// ── Thresholds ──────────────────────────────────────────────────────────

/** Minutes before a run appears in the ATTENTION "aging" zone */
export const AGING_THRESHOLD_MS = 20 * 60_000;
/** Minutes before a run's health signal turns "warning" */
export const HEALTH_WARNING_THRESHOLD_MS = 30 * 60_000;

// ── Duration formatting ─────────────────────────────────────────────────

export function fmtDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

export function avgDuration(runs: Run[]): string {
  const finished = runs.filter((r) => r.finished_at);
  if (finished.length === 0) return "--";
  const avg = finished.reduce(
    (s, r) => s + (new Date(r.finished_at!).getTime() - new Date(r.started_at).getTime()), 0,
  ) / finished.length;
  return fmtDuration(avg);
}

export function medianDuration(runs: Run[]): string {
  const ds = runs
    .filter((r) => r.finished_at)
    .map((r) => new Date(r.finished_at!).getTime() - new Date(r.started_at).getTime())
    .sort((a, b) => a - b);
  if (ds.length === 0) return "--";
  const mid = Math.floor(ds.length / 2);
  const ms = ds.length % 2 === 0 ? (ds[mid - 1] + ds[mid]) / 2 : ds[mid];
  return fmtDuration(ms);
}

// ── Health signal ───────────────────────────────────────────────────────

export function elapsedMs(startedAt: string, refTime: number): number {
  return refTime - new Date(startedAt).getTime();
}

export function fmtElapsed(startedAt: string, refTime: number): string {
  const ms = elapsedMs(startedAt, refTime);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

export function healthSignal(run: Run, refTime: number): "critical" | "warning" | "ok" {
  if (run.state === "waiting_human" || run.state === "failed") return "critical";
  if (elapsedMs(run.started_at, refTime) > HEALTH_WARNING_THRESHOLD_MS) return "warning";
  return "ok";
}

// ── Distribution ────────────────────────────────────────────────────────

export interface DistItem { label: string; count: number; color: string; }

export function stateDistribution(runs: Run[]): DistItem[] {
  const counts = new Map<string, number>();
  for (const run of runs) counts.set(run.state, (counts.get(run.state) ?? 0) + 1);

  const colorMap: Record<string, string> = {
    queued: "bg-dim", preparing: "bg-cyan", planning: "bg-cyan",
    coding: "bg-neon-green", running_commands: "bg-neon-green",
    reviewing: "bg-violet", waiting_human: "bg-gold",
    opening_pr: "bg-mineral", completed: "bg-mineral",
    failed: "bg-oxide", cancelled: "bg-dim",
  };

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label: label.replace(/_/g, " "),
      count,
      color: colorMap[label] ?? "bg-dim",
    }));
}

// ── Step labels ─────────────────────────────────────────────────────────

export const stepLabel: Record<string, string> = {
  prepare: "Prepare", plan: "Plan", code: "Code",
  commands: "Commands", review_swarm: "Review", create_pr: "PR", await_human: "Human",
};

// ── View state helpers ─────────────────────────────────────────────────

export function shouldShowInterrupts(state: RunState, interruptCount: number): boolean {
  return interruptCount > 0 || state === "waiting_human";
}

export function watchButtonClass(watched: boolean, maxReached: boolean): string {
  if (watched) return "text-mineral hover:text-oxide";
  if (maxReached) return "text-dim/30 cursor-not-allowed";
  return "text-dim hover:text-mineral opacity-0 group-hover:opacity-100";
}

export const stateIcon: Partial<Record<RunState, string>> = {
  coding: "01",
  planning: "02",
  reviewing: "03",
  running_commands: "04",
  preparing: "05",
  opening_pr: "06",
  waiting_human: "!!",
  queued: "--",
  completed: "OK",
  failed: "XX",
  cancelled: "~~",
};
