import { useDashboardRuns } from "@/hooks/useDashboardRuns";
import { MetricCard, KpiCell } from "../components/dashboard/MetricCards";
import { BoardCol } from "../components/dashboard/BoardCol";
import { SessionWatchRail } from "../components/dashboard/SessionWatchRail";
import { AlertRow } from "../components/dashboard/AlertRow";
import { FocusedRunPanel } from "../components/dashboard/FocusedRunPanel";
import { DistPanel, DurationRow } from "../components/dashboard/ReliabilityPanel";
import { SectionTitle } from "../components/dashboard/SectionTitle";
import { TopBar } from "../components/dashboard/TopBar";
import { CompletedTable } from "../components/dashboard/CompletedTable";
import { avgDuration, medianDuration, stateDistribution } from "@/lib/domain";

export function ControlCenter() {
  const d = useDashboardRuns();
  return (
    <div className="min-h-screen bg-void">
      <TopBar
        lastRefresh={d.lastRefresh}
        needsAttention={d.needsAttention}
        loading={d.loading}
        onRefresh={d.refresh}
      />

      <SessionWatchRail refTime={d.refTime} mode="overview" />
      <FocusedRunPanel refTime={d.refTime} />

      <main className="mx-auto max-w-360 px-6 py-10 space-y-12">
        {d.error ? (
          <div className="panel glow-red p-3 font-data text-[12px] text-oxide">{d.error}</div>
        ) : null}

        {/* ── Executive Summary + KPI ── */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 fade-up">
            <MetricCard
              label="Completed"
              value={d.completed.length}
              sub={d.terminal.length > 0 ? `/ ${d.terminal.length} total` : ""}
              color="mineral"
            />
            <MetricCard
              label="Active"
              value={d.active.length}
              sub={d.inProgress.length > 0 ? `${d.inProgress.length} in progress` : "idle"}
              color="cyan"
            />
            <MetricCard
              label="Attention"
              value={d.needsAttention.length}
              sub={
                d.needsAttention.length === 0
                  ? "all clear"
                  : `${d.waitingHuman.length} blocked · ${d.failed.length} failed`
              }
              color={d.needsAttention.length > 0 ? "oxide" : "dim"}
              glow={d.needsAttention.length > 0}
            />
            <MetricCard
              label="Success Rate"
              value={d.successRate !== null ? `${d.successRate}%` : "--"}
              sub={d.terminal.length > 0 ? `${d.terminal.length} terminal runs` : "no data"}
              color={
                d.successRate !== null && d.successRate >= 80
                  ? "mineral"
                  : d.successRate !== null && d.successRate < 50
                    ? "oxide"
                    : "silver"
              }
            />
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 fade-up delay-1">
            <KpiCell label="Median" value={medianDuration(d.runs)} />
            <KpiCell label="Oldest Active" value={d.oldestActive} />
            <KpiCell
              label="Waiting"
              value={d.waitingHuman.length}
              alert={d.waitingHuman.length > 0}
            />
            <KpiCell label="Failed" value={d.failed.length} alert={d.failed.length > 0} />
            <KpiCell label="Reviewing" value={d.reviewing.length} />
            <KpiCell label="Opening PR" value={d.openingPr.length} />
          </div>
        </div>

        {/* ── Attention Zone ── */}
        {(d.needsAttention.length > 0 || d.aging.length > 0) && (
          <section className="fade-up delay-2">
            <SectionTitle
              title="ATTENTION"
              accent="oxide"
              count={d.needsAttention.length + d.aging.length}
            />
            <div className="panel glow-red overflow-hidden">
              {d.needsAttention.map((run, i) => (
                <AlertRow
                  key={run.id}
                  run={run}
                  refTime={d.refTime}
                  reason={run.state === "waiting_human" ? "Blocked — waiting human" : "Run failed"}
                  isLast={i === d.needsAttention.length - 1 && d.aging.length === 0}
                />
              ))}
              {d.aging.map((run, i) => (
                <AlertRow
                  key={run.id}
                  run={run}
                  refTime={d.refTime}
                  reason={`Aging — ${d.oldestActive} elapsed`}
                  isLast={i === d.aging.length - 1}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Active Runs Board ── */}
        {d.active.length > 0 && (
          <section className="fade-up delay-3">
            <SectionTitle title="ACTIVE RUNS" count={d.active.length} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <BoardCol
                title="In Progress"
                count={d.inProgress.length}
                runs={d.inProgress}
                refTime={d.refTime}
                accent="cyan"
              />
              <BoardCol
                title="Needs Human"
                count={d.waitingHuman.length}
                runs={d.waitingHuman}
                refTime={d.refTime}
                accent="gold"
              />
              <BoardCol
                title="Queued"
                count={d.queued.length}
                runs={d.queued}
                refTime={d.refTime}
                accent="dim"
              />
            </div>
          </section>
        )}

        <CompletedTable completed={d.completed} />

        {/* ── Reliability ── */}
        <section className="fade-up">
          <SectionTitle title="RELIABILITY" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <DistPanel title="By State" items={stateDistribution(d.runs)} total={d.runs.length} />
            <DistPanel
              title="Terminal Outcomes"
              items={[
                { label: "Completed", count: d.completed.length, color: "bg-mineral" },
                { label: "Failed", count: d.failed.length, color: "bg-oxide" },
                { label: "Cancelled", count: d.cancelled.length, color: "bg-dim" },
              ]}
              total={d.terminal.length}
            />
            <div className="panel p-4">
              <h4 className="font-data text-[10px] uppercase tracking-wider text-dim mb-4">
                Avg Duration
              </h4>
              <div className="space-y-3">
                <DurationRow
                  label="Completed"
                  value={avgDuration(d.completed)}
                  color="text-mineral"
                />
                <DurationRow label="Failed" value={avgDuration(d.failed)} color="text-oxide" />
                <DurationRow
                  label="Median (all)"
                  value={medianDuration(d.runs)}
                  color="text-silver"
                />
              </div>
            </div>
          </div>
        </section>

        <div className="h-10" />
      </main>
    </div>
  );
}
