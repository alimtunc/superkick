import { StalledBadge } from '@/components/dashboard/queue/StalledBadge'
import { ExecutionModeBadge } from '@/components/ExecutionModeBadge'
import { InboxActionLink } from '@/components/inbox/InboxActionLink'
import { InboxActionPill } from '@/components/inbox/InboxActionPill'
import { RunBadges } from '@/components/runs/RunBadges'
import { RunStateBadge } from '@/components/RunStateBadge'
import { fmtRunElapsed, pickRunReason, stepLabel } from '@/lib/domain'
import { inboxActionAriaLabel, pickPrimaryAction, pickSecondaryAction } from '@/lib/inbox/actions'
import type { InboxAction, QueueRunSummary } from '@/types'
import { ArrowRight } from 'lucide-react'

interface RunCardProps {
	run: QueueRunSummary
	refTime: number
	// `respond` is purely a visual hook for the Needs Human column; the primary verb still comes from the action helper.
	variant: 'default' | 'respond'
}

export function RunCard({ run, refTime, variant }: RunCardProps) {
	const step = run.current_step_key ? (stepLabel[run.current_step_key] ?? run.current_step_key) : null
	const reason = pickRunReason(run)
	const elapsed = fmtRunElapsed(run, refTime)

	const primary = pickPrimaryAction({ kind: 'queue-run', run })
	const secondary = pickSecondaryAction({ kind: 'queue-run', run }, primary)
	const issueAction: InboxAction = {
		verb: 'view',
		label: 'Issue',
		destination: { kind: 'issue', issueId: run.issue_id }
	}

	const variantClass =
		variant === 'respond'
			? 'border-border focus-within:border-danger hover:border-danger'
			: 'border-border focus-within:border-border-strong hover:border-border-strong'

	const secondarySlotClass =
		'font-data inline-flex h-5 items-center rounded px-1.5 transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none'

	return (
		<div
			className={`group flex flex-col gap-1.5 rounded-md border bg-raised p-2.5 transition-colors hover:bg-raised/80 ${variantClass}`}
		>
			<InboxActionLink
				action={primary}
				ariaLabel={inboxActionAriaLabel(primary, run.issue_identifier)}
				className="flex flex-col gap-1.5 rounded focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
			>
				<div className="flex items-center gap-2">
					<RunStateBadge state={run.state} />
					<span className="font-data truncate text-[12px] font-medium text-fg transition-colors group-hover:text-success">
						{run.issue_identifier}
					</span>
					<span className="ml-auto shrink-0">
						<RunBadges run={run} />
					</span>
				</div>

				<div className="flex items-center justify-between gap-2">
					<span className="font-data truncate text-[10px] text-fg-muted">{step ?? 'n/a'}</span>
					<span className="font-data shrink-0 text-[10px] text-fg-dim">{elapsed}</span>
				</div>

				<div className="font-data flex min-w-0 items-center gap-1 truncate text-[10px] text-fg-dim">
					<span className="truncate">{run.repo_slug}</span>
					{run.branch_name ? (
						<>
							<ArrowRight
								size={10}
								strokeWidth={1.75}
								className="shrink-0"
								aria-hidden="true"
							/>
							<span className="truncate">{run.branch_name}</span>
						</>
					) : null}
				</div>

				{reason ? <p className="font-data line-clamp-2 text-[10px] text-fg-muted">{reason}</p> : null}

				{run.stalled_for_seconds != null && run.stalled_reason != null ? (
					<StalledBadge run={run} />
				) : null}

				{run.execution_mode ? (
					<div>
						<ExecutionModeBadge mode={run.execution_mode} />
					</div>
				) : null}

				<span className="self-end transition-colors">
					<InboxActionPill action={primary} />
				</span>
			</InboxActionLink>

			<div className="flex items-center justify-end gap-1">
				{secondary ? (
					<InboxActionLink
						action={secondary}
						ariaLabel={inboxActionAriaLabel(secondary, run.issue_identifier)}
						className={secondarySlotClass}
					>
						<InboxActionPill action={secondary} muted />
					</InboxActionLink>
				) : null}
				<InboxActionLink
					action={issueAction}
					ariaLabel={`Issue for ${run.issue_identifier}`}
					className={secondarySlotClass}
				>
					<InboxActionPill action={issueAction} muted />
				</InboxActionLink>
			</div>
		</div>
	)
}
