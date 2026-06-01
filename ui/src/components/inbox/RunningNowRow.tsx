import { actionLinkWrap } from '@/components/inbox/actionLinkWrap'
import { InboxActionPill } from '@/components/inbox/InboxActionPill'
import { InboxRow } from '@/components/inbox/InboxRow'
import { Pill } from '@/components/ui/pill'
import { fmtElapsed, stepLabel } from '@/lib/domain'
import { pickPrimaryAction } from '@/lib/inbox/actions'
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
			wrap={actionLinkWrap(action, run.issue_identifier)}
			actions={<InboxActionPill action={action} />}
		/>
	)
}
