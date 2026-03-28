import type { RunStep, StepStatus } from "../types";

const statusIcon: Record<StepStatus, string> = {
  pending: "\u25cb",
  running: "\u25cf",
  succeeded: "\u2713",
  failed: "\u2717",
  skipped: "\u2014",
};

const statusColor: Record<StepStatus, string> = {
  pending: "text-gray-500",
  running: "text-blue-400 animate-pulse",
  succeeded: "text-green-400",
  failed: "text-red-400",
  skipped: "text-gray-600",
};

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.round((e - s) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function StepTimeline({ steps }: { steps: RunStep[] }) {
  if (steps.length === 0) return <p className="text-gray-500 text-sm">No steps yet.</p>;

  return (
    <div className="space-y-1">
      {steps.map((step) => (
        <div
          key={step.id}
          className="flex items-center gap-3 rounded bg-slate-800/50 px-3 py-2 text-sm"
        >
          <span className={`text-lg ${statusColor[step.status]}`}>
            {statusIcon[step.status]}
          </span>
          <span className="font-mono text-slate-300 w-32">{step.step_key}</span>
          <span className="text-slate-500 text-xs">
            {step.status}
            {step.attempt > 1 ? ` (attempt ${step.attempt})` : ""}
          </span>
          <span className="ml-auto text-slate-500 text-xs font-mono">
            {formatDuration(step.started_at, step.finished_at)}
          </span>
          {step.error_message ? (
            <span className="text-red-400 text-xs truncate max-w-64" title={step.error_message}>
              {step.error_message}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
