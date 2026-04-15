import { fmtDuration, stepLabel } from '@/lib/domain'
import type { RunStep, StepStatus } from '@/types'

interface StatusVisual {
	icon: string
	color: string
	label: string
}

const statusVisual: Record<StepStatus, StatusVisual> = {
	pending: { icon: '\u25cb', color: 'text-dim', label: 'Queued' },
	running: { icon: '\u25cf', color: 'text-cyan live-pulse', label: 'In progress' },
	succeeded: { icon: '\u2713', color: 'text-mineral', label: 'Done' },
	failed: { icon: '\u2717', color: 'text-oxide', label: 'Failed' },
	skipped: { icon: '\u2014', color: 'text-dim', label: 'Skipped' }
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
						<span className={`text-base ${visual.color}`}>{visual.icon}</span>
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
