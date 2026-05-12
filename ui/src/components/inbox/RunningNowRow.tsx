import { InboxActionLink } from '@/components/inbox/InboxActionLink'
import { InboxActionPill } from '@/components/inbox/InboxActionPill'
import { InboxRow } from '@/components/inbox/InboxRow'
import { Pill } from '@/components/ui/pill'
import { fmtElapsed, stepLabel } from '@/lib/domain'
import { inboxActionAriaLabel, pickPrimaryAction } from '@/lib/inbox/actions'
import { runningNowPillLabel, runningNowTone } from '@/lib/inbox/runningNow'
import type { QueueRunSummary } from '@/types'

interface RunningNowRowProps {
	run: QueueRunSummary
	refTime: number
}

export function RunningNowRow({ run, refTime }: RunningNowRowProps) {
	const action = pickPrimaryAction({ kind: 'queue-run', run })
	const tone = runningNowTone(run)
	const pillLabel = runningNowPillLabel(run)
	const stepLabelText = run.current_step_key
		? (stepLabel[run.current_step_key] ?? run.current_step_key)
		: null
	const pulse = pillLabel === 'running'
	const ctxParts = [run.issue_identifier, stepLabelText, run.branch_name].filter((v): v is string =>
		Boolean(v)
	)

	return (
		<InboxRow
			tone={tone}
			title={run.issue_identifier}
			sub={
				<Pill tone={tone} size="sm" dot pulse={pulse}>
					{pillLabel}
				</Pill>
			}
			why={run.reason || null}
			ctx={ctxParts.join(' · ')}
			age={fmtElapsed(run.started_at, refTime)}
			wrap={(inner) => (
				<InboxActionLink
					action={action}
					ariaLabel={inboxActionAriaLabel(action, run.issue_identifier)}
					className="flex min-w-0 flex-1 items-start"
				>
					{inner}
				</InboxActionLink>
			)}
			actions={<InboxActionPill action={action} />}
		/>
	)
}
