import { Link } from "react-router-dom";
import type { Run } from "../../types";
import { useWatchedSessionsCtx } from "../../context/WatchedSessionsContext";
import { fmtElapsed, healthSignal, stepLabel, stateIcon, watchButtonClass } from "./utils";

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
  const { isWatched, toggleWatch, maxReached } = useWatchedSessionsCtx();
  const watched = isWatched(run.id);

  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-deep/50 transition-colors group">
      <span className={`status-bar h-8 mt-0.5 ${barColor}`} />
      <Link to={`/runs/${run.id}`} className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="font-data text-[12px] text-fog font-medium group-hover:text-neon-green transition-colors">
            {run.issue_identifier}
          </span>
          <span className="font-data text-[10px] text-dim">{stateIcon[run.state] ?? "--"}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-data text-[10px] text-dim truncate">{run.repo_slug}</span>
          {run.current_step_key ? (
            <span className="font-data text-[10px] text-ash">
              {stepLabel[run.current_step_key] ?? run.current_step_key}
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="font-data text-[10px] text-dim">{fmtElapsed(run.started_at, refTime)}</span>
          {run.branch_name ? (
            <span className="font-data text-[10px] text-dim truncate max-w-28">{run.branch_name}</span>
          ) : null}
        </div>
      </Link>
      <button
        onClick={() => toggleWatch(run.id)}
        disabled={!watched && maxReached}
        className={`shrink-0 mt-1 font-data text-[10px] px-1.5 py-0.5 rounded transition-colors ${watchButtonClass(watched, maxReached)}`}
        title={watched ? "Unwatch" : maxReached ? "Max 5 watched" : "Watch this run"}
      >
        {watched ? "◉" : "○"}
      </button>
    </div>
  );
}

function WatchChip({ run, refTime, isFocused, onUnwatch }: {
  run: Run; refTime: number; isFocused: boolean; onUnwatch: () => void;
}) {
  const sig = healthSignal(run, refTime);
  const dotColor = sig === "critical" ? "bg-oxide" : sig === "warning" ? "bg-gold" : "bg-mineral";

  return (
    <span
      className={`shrink-0 flex items-center gap-2 rounded border px-2.5 py-1 transition-colors group cursor-pointer ${
        isFocused
          ? "border-mineral/40 bg-mineral-dim ring-1 ring-mineral/20"
          : "border-edge bg-graphite hover:border-border"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${sig === "critical" ? "live-pulse" : ""}`} />
      <span className={`font-data text-[11px] transition-colors ${
        isFocused ? "text-mineral font-medium" : "text-fog group-hover:text-neon-green"
      }`}>
        {run.issue_identifier}
      </span>
      <span className="font-data text-[10px] text-dim">
        {run.current_step_key ? stepLabel[run.current_step_key] ?? run.current_step_key : run.state.replace(/_/g, " ")}
      </span>
      <span className="font-data text-[10px] text-dim">
        {fmtElapsed(run.started_at, refTime)}
      </span>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUnwatch(); }}
        className="ml-0.5 font-data text-[10px] text-dim hover:text-oxide transition-colors"
        title="Unwatch"
      >
        &times;
      </button>
    </span>
  );
}

export function SessionWatchRail({ refTime, mode = "overview" }: {
  refTime: number;
  mode?: "overview" | "detail";
}) {
  const { watchedRuns, focusedId, focus, unwatch, clearFocus } = useWatchedSessionsCtx();

  if (watchedRuns.length === 0) return null;

  const handleChipClick = (runId: string) => {
    if (focusedId === runId) clearFocus();
    else focus(runId);
  };

  return (
    <div className="border-b border-edge bg-carbon/60">
      <div className="mx-auto max-w-[1440px] px-5 py-1.5 flex items-center gap-2 overflow-x-auto">
        <span className="font-data text-[9px] uppercase tracking-widest text-dim shrink-0 mr-1">Watch</span>
        {watchedRuns.map((run) => {
          const isFocused = run.id === focusedId;
          const chip = <WatchChip run={run} refTime={refTime} isFocused={isFocused} onUnwatch={() => unwatch(run.id)} />;

          if (mode === "detail") {
            return (
              <Link key={run.id} to={`/runs/${run.id}`} onClick={() => focus(run.id)}>
                {chip}
              </Link>
            );
          }

          return (
            <span key={run.id} onClick={() => handleChipClick(run.id)}>
              {chip}
            </span>
          );
        })}
      </div>
    </div>
  );
}
