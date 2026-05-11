import { StalledBadge } from '@/components/dashboard/queue/StalledBadge'
import { InboxActionLink } from '@/components/inbox/InboxActionLink'
import { InboxActionPill } from '@/components/inbox/InboxActionPill'
import { RunStateBadge } from '@/components/RunStateBadge'
import { Pill } from '@/components/ui/pill'
import { fmtElapsed, stepLabel } from '@/lib/domain'
import { inboxActionAriaLabel, pickPrimaryAction } from '@/lib/inbox/actions'
import { runPillSlots } from '@/lib/runs/pillSlots'
import type { QueueRunSummary } from '@/types'

interface RunningNowRowProps {
	run: QueueRunSummary
	refTime: number
}

export function RunningNowRow({ run, refTime }: RunningNowRowProps) {
	const action = pickPrimaryAction({ kind: 'queue-run', run })
	const step = run.current_step_key ? (stepLabel[run.current_step_key] ?? run.current_step_key) : null
	const showSecondLine = !!(run.reason || run.branch_name)
	const slots = runPillSlots(run)

	return (
		<InboxActionLink
			action={action}
			ariaLabel={inboxActionAriaLabel(action, run.issue_identifier)}
			className="group flex flex-col gap-1 border-l-2 border-transparent px-3 py-2 transition-colors hover:border-l-edge-bright hover:bg-slate-deep/40 focus-visible:border-l-mineral focus-visible:bg-slate-deep/40 focus-visible:outline-none"
		>
			<div className="flex items-center gap-3">
				<RunStateBadge state={run.state} />
				<span className="font-data shrink-0 text-[12px] font-medium text-fog transition-colors group-hover:text-neon-green">
					{run.issue_identifier}
				</span>
				{step ? <span className="font-data shrink-0 text-[10px] text-ash">{step}</span> : null}
				{run.stalled_for_seconds != null && run.stalled_reason != null ? (
					<StalledBadge run={run} />
				) : null}
				<span className="ml-auto flex shrink-0 items-center gap-2">
					{slots.attention ? (
						<Pill tone="oxide" size="xs" title="Pending attention">
							{slots.attention.count} ATTN
						</Pill>
					) : null}
					{slots.interrupt ? (
						<Pill tone="gold" size="xs" title="Pending interrupts">
							{slots.interrupt.count} INTR
						</Pill>
					) : null}
					{slots.pr ? (
						<Pill tone="violet" size="xs" title={`PR ${slots.pr.state}`}>
							PR #{slots.pr.number}
						</Pill>
					) : null}
					<span className="font-data text-[10px] text-ash">
						{fmtElapsed(run.started_at, refTime)}
					</span>
					<InboxActionPill action={action} />
				</span>
			</div>
			{showSecondLine ? (
				<div className="flex items-center gap-3 pl-1">
					{run.reason ? (
						<span className="font-data flex-1 truncate text-[10px] text-silver">
							{run.reason}
						</span>
					) : null}
					{run.branch_name ? (
						<span className="font-data shrink-0 truncate text-[10px] text-ash">
							{run.branch_name}
						</span>
					) : null}
				</div>
			) : null}
		</InboxActionLink>
	)
}
