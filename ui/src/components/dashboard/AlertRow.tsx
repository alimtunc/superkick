import { Link } from "react-router-dom";
import { RunStateBadge } from "../RunStateBadge";
import type { Run } from "../../types";
import { fmtElapsed } from "./utils";

export function AlertRow({ run, refTime, reason, isLast }: {
  run: Run; refTime: number; reason: string; isLast: boolean;
}) {
  const borderClass = isLast ? "" : "border-b border-edge/50";
  const isBlocked = run.state === "waiting_human" || run.state === "failed";

  return (
    <Link
      to={`/runs/${run.id}`}
      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-oxide-dim/40 transition-colors ${borderClass} group`}
    >
      <span className={`status-bar h-6 ${isBlocked ? "bg-oxide live-pulse" : "bg-gold"}`} />
      <span className="font-data text-[12px] text-fog font-medium w-20 shrink-0 group-hover:text-oxide transition-colors">
        {run.issue_identifier}
      </span>
      <span className="font-data text-[11px] text-dim hidden sm:block w-24 truncate">{run.repo_slug}</span>
      <RunStateBadge state={run.state} />
      <span className="font-data text-[11px] text-dim hidden md:block">{run.current_step_key ?? "--"}</span>
      <span className="text-[11px] text-ash ml-auto hidden md:block">{reason}</span>
      <span className="font-data text-[11px] text-dim shrink-0">
        {fmtElapsed(run.started_at, refTime)}
      </span>
    </Link>
  );
}
