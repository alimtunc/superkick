import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { RunStateBadge } from "@/components/RunStateBadge";
import type { Run } from "@/types";

interface AlertRowProps {
  run: Run;
  refTime: number;
  reason: string;
  isLast: boolean;
}
import { useWatchedSessionsStore } from "@/stores/watchedSessions";
import { fmtElapsed, watchButtonClass } from "@/lib/domain";

export function AlertRow({ run, refTime, reason, isLast }: AlertRowProps) {
  const borderClass = isLast ? "" : "border-b border-edge/50";
  const isBlocked = run.state === "waiting_human" || run.state === "failed";
  const { isWatched, toggleWatch, maxReached } = useWatchedSessionsStore();
  const watched = isWatched(run.id);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-oxide-dim/40 transition-colors ${borderClass} group`}
    >
      <span className={`status-bar h-6 ${isBlocked ? "bg-oxide live-pulse" : "bg-gold"}`} />
      <Link
        to="/runs/$runId"
        params={{ runId: run.id }}
        className="flex items-center gap-3 min-w-0 flex-1"
      >
        <span className="font-data text-[12px] text-fog font-medium w-20 shrink-0 group-hover:text-oxide transition-colors">
          {run.issue_identifier}
        </span>
        <span className="font-data text-[11px] text-dim hidden sm:block w-24 truncate">
          {run.repo_slug}
        </span>
        <RunStateBadge state={run.state} />
        <span className="font-data text-[11px] text-dim hidden md:block">
          {run.current_step_key ?? "--"}
        </span>
        <span className="text-[11px] text-ash ml-auto hidden md:block">{reason}</span>
        <span className="font-data text-[11px] text-dim shrink-0">
          {fmtElapsed(run.started_at, refTime)}
        </span>
      </Link>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => toggleWatch(run.id)}
        disabled={!watched && maxReached}
        className={`shrink-0 font-data text-[10px] ${watchButtonClass(watched, maxReached)}`}
        title={watched ? "Unwatch" : "Watch"}
      >
        {watched ? "\u25C9" : "\u25CB"}
      </Button>
    </div>
  );
}
