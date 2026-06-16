import { Icon, Pill } from '@/components/primitives'
import { ResultRowShell } from '@/domains/command/components/ResultRowShell'
import { formatShortDate } from '@/lib/format'
import type { SearchRunRow } from '@/types'

interface RunResultRowProps {
	run: SearchRunRow
	selected: boolean
	onSelect: () => void
	onActivate: () => void
}

const ACTIVE_STATES: ReadonlySet<string> = new Set([
	'planning',
	'coding',
	'running_commands',
	'reviewing',
	'preparing'
])

export function RunResultRow({ run, selected, onSelect, onActivate }: RunResultRowProps) {
	const shortId = run.runId.slice(0, 8)
	const stepLabel = run.currentStep ?? '—'
	const elapsed = formatShortDate(run.createdAt)
	const issueLabel = run.issueIdentifier ?? '—'
	const isActive = ACTIVE_STATES.has(run.state)
	return (
		<ResultRowShell
			selected={selected}
			onSelect={onSelect}
			onActivate={onActivate}
			leading={<Icon name="loop" size={16} className="text-info" />}
			primary={
				<span>
					<span className="font-mono text-fg">run-{shortId}</span>
					<span className="text-fg-muted"> · {stepLabel}</span>
				</span>
			}
			secondary={`${run.repoSlug} · ${run.state.replace(/_/g, ' ')} · ${elapsed} · ${issueLabel}`}
			trailing={
				isActive ? (
					<Pill tone="info" size="xs" dot pulse>
						running
					</Pill>
				) : null
			}
		/>
	)
}
