import type { RunStep, StepStatus } from "../types";
import { fmtDuration } from "./dashboard/utils";

const statusIcon: Record<StepStatus, string> = {
  pending: "\u25cb",
  running: "\u25cf",
  succeeded: "\u2713",
  failed: "\u2717",
  skipped: "\u2014",
};

const statusColor: Record<StepStatus, string> = {
  pending: "text-dim",
  running: "text-cyan live-pulse",
  succeeded: "text-mineral",
  failed: "text-oxide",
  skipped: "text-dim",
};

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "";
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  return fmtDuration(ms);
}

export function StepTimeline({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) return <p className="text-dim text-sm font-data">No steps yet.</p>;

  return (
    <div className="space-y-0.5">
      {steps.map((step) => (
        <div
          key={step.id}
          className="flex items-center gap-3 rounded border border-edge/50 bg-graphite/50 px-3 py-2 text-sm"
        >
          <span className={`text-base ${statusColor[step.status]}`}>
            {statusIcon[step.status]}
          </span>
          <span className="font-data text-fog w-28 text-[12px]">{step.step_key}</span>
          <span className="text-dim text-[11px]">
            {step.status}
            {step.attempt > 1 ? ` (attempt ${step.attempt})` : ""}
          </span>
          <span className="ml-auto font-data text-dim text-[11px]">
            {formatDuration(step.started_at, step.finished_at)}
          </span>
          {step.error_message ? (
            <span className="text-oxide text-[11px] truncate max-w-64" title={step.error_message}>
              {step.error_message}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
