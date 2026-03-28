import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { Run } from "@/types";
import { useWatchedSessionsStore } from "@/stores/watchedSessions";
import { queryKeys } from "@/lib/queryKeys";
import { WatchChip } from "./WatchChip";

interface SessionWatchRailProps {
  refTime: number;
  mode?: "overview" | "detail";
}

export function SessionWatchRail({ refTime, mode = "overview" }: SessionWatchRailProps) {
  const { ids, focusedId, focus, unwatch, clearFocus } = useWatchedSessionsStore();
  const queryClient = useQueryClient();
  const allRuns = queryClient.getQueryData<Run[]>(queryKeys.runs.all) ?? [];

  const watchedRuns = useMemo(() => {
    const map = new Map(allRuns.map((r) => [r.id, r]));
    return ids.map((id) => map.get(id)).filter((r): r is Run => !!r);
  }, [ids, allRuns]);

  if (watchedRuns.length === 0) return null;

  const handleChipClick = (runId: string) => {
    if (focusedId === runId) clearFocus();
    else focus(runId);
  };

  return (
    <div className="border-b border-edge bg-carbon/60">
      <div className="mx-auto max-w-360 px-5 py-1.5 flex items-center gap-2 overflow-x-auto">
        <span className="font-data text-[9px] uppercase tracking-widest text-dim shrink-0 mr-1">
          Watch
        </span>
        {watchedRuns.map((run) => {
          const isFocused = run.id === focusedId;
          const chip = (
            <WatchChip
              run={run}
              refTime={refTime}
              isFocused={isFocused}
              onUnwatch={() => unwatch(run.id)}
            />
          );

          if (mode === "detail") {
            return (
              <Link
                key={run.id}
                to="/runs/$runId"
                params={{ runId: run.id }}
                onClick={() => focus(run.id)}
              >
                {chip}
              </Link>
            );
          }

          return (
            <button
              key={run.id}
              type="button"
              onClick={() => handleChipClick(run.id)}
              className="appearance-none bg-transparent border-0 p-0 text-left"
            >
              {chip}
            </button>
          );
        })}
      </div>
    </div>
  );
}
