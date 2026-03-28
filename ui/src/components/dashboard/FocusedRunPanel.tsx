import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, skipToken } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchRun } from "@/api";
import { RunStateBadge } from "@/components/RunStateBadge";
import { StepTimeline } from "@/components/run-detail/StepTimeline";
import type { Interrupt, Run } from "@/types";
import { useWatchedSessionsStore } from "@/stores/watchedSessions";
import { fmtElapsed } from "@/lib/domain";
import { TERMINAL_STATES } from "@/lib/constants";
import { queryKeys } from "@/lib/queryKeys";

function InterruptSummary({ interrupts }: { interrupts: Interrupt[] }) {
  const pending = interrupts.filter((i) => i.status === "pending");
  return (
    <div className="rounded border border-gold/20 bg-gold-dim p-2">
      <span className="font-data text-[10px] text-gold uppercase tracking-wider">
        {pending.length} pending interrupt{pending.length !== 1 ? "s" : ""}
      </span>
      {pending.slice(0, 2).map((int) => (
        <p key={int.id} className="font-data text-[11px] text-fog mt-1 truncate">
          {int.question}
        </p>
      ))}
    </div>
  );
}

export function FocusedRunPanel({ refTime }: { refTime: number }) {
  const focusedId = useWatchedSessionsStore((s) => s.focusedId);
  const clearFocus = useWatchedSessionsStore((s) => s.clearFocus);

  const queryClient = useQueryClient();
  const runsData = queryClient.getQueryData<Run[]>(queryKeys.runs.all);
  const focusedRun = runsData?.find((r) => r.id === focusedId) ?? null;

  const isTerminal = focusedRun ? TERMINAL_STATES.has(focusedRun.state) : true;

  const refetchInterval = isTerminal ? undefined : 10_000;
  const query = useQuery({
    queryKey: queryKeys.runs.detail(focusedId ?? ""),
    queryFn: focusedId ? () => fetchRun(focusedId) : skipToken,
    refetchInterval,
  });
  const data = query.data;
  const loading = query.isLoading;
  const queryError = query.error;

  const error = queryError ? String(queryError) : null;

  if (!focusedId || !focusedRun) return null;

  return (
    <div className="border-b border-edge bg-carbon/40">
      <div className="mx-auto max-w-360 px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="font-data text-[9px] uppercase tracking-widest text-dim">Focused</span>
            <h2 className="text-sm font-medium text-fog">{focusedRun.issue_identifier}</h2>
            <RunStateBadge state={focusedRun.state} />
            <span className="font-data text-[10px] text-dim">{focusedRun.repo_slug}</span>
            <span className="font-data text-[10px] text-dim">
              {fmtElapsed(focusedRun.started_at, refTime)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/runs/$runId"
              params={{ runId: focusedRun.id }}
              className="font-data text-[11px] text-silver hover:text-fog border border-edge rounded px-2 py-0.5 hover:border-edge-bright transition-colors"
            >
              FULL DETAIL
            </Link>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={clearFocus}
              className="font-data text-[11px] text-dim hover:text-silver"
              title="Close panel"
            >
              &times;
            </Button>
          </div>
        </div>

        {loading && !data?.run ? (
          <p className="font-data text-[11px] text-dim py-2">Loading...</p>
        ) : error ? (
          <p className="font-data text-[11px] text-oxide py-2">{error}</p>
        ) : data?.run ? (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-4">
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <div>
                  <dt className="font-data text-[9px] uppercase tracking-wider text-dim">Branch</dt>
                  <dd className="font-data text-silver mt-0.5">{data.run.branch_name ?? "--"}</dd>
                </div>
                <div>
                  <dt className="font-data text-[9px] uppercase tracking-wider text-dim">Step</dt>
                  <dd className="font-data text-silver mt-0.5">
                    {data.run.current_step_key ?? "--"}
                  </dd>
                </div>
                <div>
                  <dt className="font-data text-[9px] uppercase tracking-wider text-dim">
                    Started
                  </dt>
                  <dd className="font-data text-silver mt-0.5">
                    {new Date(data.run.started_at).toLocaleTimeString()}
                  </dd>
                </div>
                <div>
                  <dt className="font-data text-[9px] uppercase tracking-wider text-dim">
                    Trigger
                  </dt>
                  <dd className="font-data text-silver mt-0.5">{data.run.trigger_source}</dd>
                </div>
              </dl>
              {data.run.error_message && (
                <p className="rounded bg-oxide-dim border border-oxide/20 p-2 text-[11px] text-oxide font-data">
                  {data.run.error_message}
                </p>
              )}
              {data.interrupts.length > 0 && <InterruptSummary interrupts={data.interrupts} />}
            </div>
            <div>
              <span className="font-data text-[9px] uppercase tracking-wider text-dim mb-2 block">
                Steps
              </span>
              <StepTimeline steps={data.steps} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
