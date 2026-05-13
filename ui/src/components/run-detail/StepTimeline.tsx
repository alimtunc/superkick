import { fmtDuration, stepLabel } from '@/lib/domain'
import type { RunStep, StepStatus } from '@/types'
import { Check, Circle, CircleDot, Minus, X } from 'lucide-react'

interface StatusVisual {
	color: string
	label: string
}

const statusVisual: Record<StepStatus, StatusVisual> = {
	pending: { color: 'text-dim', label: 'Queued' },
	running: { color: 'text-cyan live-pulse', label: 'In progress' },
	succeeded: { color: 'text-mineral', label: 'Done' },
	failed: { color: 'text-oxide', label: 'Failed' },
	skipped: { color: 'text-dim', label: 'Skipped' }
}

function statusIcon(status: StepStatus) {
	const props = { size: 14, strokeWidth: 1.9, 'aria-hidden': true }
	switch (status) {
		case 'pending':
			return <Circle {...props} />
		case 'running':
			return <CircleDot {...props} />
		case 'succeeded':
			return <Check {...props} />
		case 'failed':
			return <X {...props} />
		case 'skipped':
			return <Minus {...props} />
	}
}

function formatDuration(start: string | null, end: string | null): string {
	if (!start) return ''
	const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
	return fmtDuration(ms)
}

export function StepTimeline({ steps }: { steps: RunStep[] }) {
	if (steps.length === 0) return <p className="font-data text-sm text-dim">No progress yet.</p>

	return (
		<ol className="space-y-0.5">
			{steps.map((step) => {
				const visual = statusVisual[step.status]
				const isActive = step.status === 'running'
				return (
					<li
						key={step.id}
						className={`flex items-center gap-3 rounded border px-3 py-2 text-sm transition-colors ${
							isActive ? 'border-cyan/30 bg-cyan/5' : 'border-edge/50 bg-graphite/50'
						}`}
					>
						<span className={`inline-flex ${visual.color}`}>{statusIcon(step.status)}</span>
						<span className="font-data w-28 text-[12px] text-fog">
							{stepLabel[step.step_key] ?? step.step_key}
						</span>
						<span className={`font-data text-[11px] ${visual.color}`}>
							{visual.label}
							{step.attempt > 1 ? ` · attempt ${step.attempt}` : ''}
						</span>
						<span className="font-data ml-auto text-[11px] text-dim">
							{formatDuration(step.started_at, step.finished_at)}
						</span>
						{step.error_message ? (
							<span
								className="max-w-64 truncate text-[11px] text-oxide"
								title={step.error_message}
							>
								{step.error_message}
							</span>
						) : null}
					</li>
				)
			})}
		</ol>
	)
}
