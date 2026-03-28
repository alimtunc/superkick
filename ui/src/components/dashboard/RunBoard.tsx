import { Link } from "react-router-dom";
import type { Run } from "../../types";
import { fmtElapsed, healthSignal, stepLabel, stateIcon } from "./utils";

export function BoardCol({ title, count, runs, refTime, accent }: {
  title: string; count: number; runs: Run[]; refTime: number; accent: string;
}) {
  const accentBorder =
    accent === "cyan" ? "border-t-cyan" :
    accent === "gold" ? "border-t-gold" :
    "border-t-dim";

  return (
    <div className={`panel border-t-2 ${accentBorder} overflow-hidden`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-edge">
        <span className="font-data text-[10px] uppercase tracking-wider text-dim">{title}</span>
        <span className="font-data text-[11px] text-ash">{count}</span>
      </div>
      {runs.length === 0 ? (
        <p className="px-3 py-4 font-data text-[11px] text-dim">Empty</p>
      ) : (
        <div className="divide-y divide-edge/50">
          {runs.map((run) => (
            <BoardCard key={run.id} run={run} refTime={refTime} />
          ))}
        </div>
      )}
    </div>
  );
}

function BoardCard({ run, refTime }: { run: Run; refTime: number }) {
  const sig = healthSignal(run, refTime);
  const barColor = sig === "critical" ? "bg-oxide" : sig === "warning" ? "bg-gold" : "bg-mineral";

  return (
    <Link
      to={`/runs/${run.id}`}
      className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-deep/50 transition-colors group"
    >
      <span className={`status-bar h-8 mt-0.5 ${barColor}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="font-data text-[12px] text-fog font-medium group-hover:text-neon-green transition-colors">
            {run.issue_identifier}
          </span>
          <span className="font-data text-[10px] text-dim">{stateIcon[run.state] ?? "--"}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-data text-[10px] text-dim truncate">{run.repo_slug}</span>
          {run.current_step_key && (
            <span className="font-data text-[10px] text-ash">
              {stepLabel[run.current_step_key] ?? run.current_step_key}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="font-data text-[10px] text-dim">{fmtElapsed(run.started_at, refTime)}</span>
          {run.branch_name && (
            <span className="font-data text-[10px] text-dim truncate max-w-28">{run.branch_name}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function SessionWatchRail({ active, refTime }: { active: Run[]; refTime: number }) {
  if (active.length === 0) return null;

  return (
    <div className="border-b border-edge bg-carbon/60">
      <div className="mx-auto max-w-[1440px] px-5 py-1.5 flex items-center gap-2 overflow-x-auto">
        {active.slice(0, 6).map((run) => {
          const sig = healthSignal(run, refTime);
          const dotColor = sig === "critical" ? "bg-oxide" : sig === "warning" ? "bg-gold" : "bg-mineral";
          return (
            <Link
              key={run.id}
              to={`/runs/${run.id}`}
              className="shrink-0 flex items-center gap-2 rounded border border-edge bg-graphite px-2.5 py-1 hover:border-border transition-colors group"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${sig === "critical" ? "live-pulse" : ""}`} />
              <span className="font-data text-[11px] text-fog group-hover:text-neon-green transition-colors">
                {run.issue_identifier}
              </span>
              <span className="font-data text-[10px] text-dim">
                {run.current_step_key ? stepLabel[run.current_step_key] ?? run.current_step_key : run.state.replace(/_/g, " ")}
              </span>
              <span className="font-data text-[10px] text-dim">
                {fmtElapsed(run.started_at, refTime)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
