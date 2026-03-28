import { fmtDuration } from '@/lib/domain'
import type { RunStep, StepStatus } from '@/types'

const statusIcon: Record<StepStatus, string> = {
	pending: '\u25cb',
	running: '\u25cf',
	succeeded: '\u2713',
	failed: '\u2717',
	skipped: '\u2014'
}

const statusColor: Record<StepStatus, string> = {
	pending: 'text-dim',
	running: 'text-cyan live-pulse',
	succeeded: 'text-mineral',
	failed: 'text-oxide',
	skipped: 'text-dim'
}

function formatDuration(start: string | null, end: string | null): string {
	if (!start) return ''
	const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
	return fmtDuration(ms)
}

export function StepTimeline({ steps }: { steps: RunStep[] }) {
	if (steps.length === 0) return <p className="font-data text-sm text-dim">No steps yet.</p>

	return (
		<div className="space-y-0.5">
			{steps.map((step) => (
				<div
					key={step.id}
					className="flex items-center gap-3 rounded border border-edge/50 bg-graphite/50 px-3 py-2 text-sm"
				>
					<span className={`text-base ${statusColor[step.status]}`}>{statusIcon[step.status]}</span>
					<span className="font-data w-28 text-[12px] text-fog">{step.step_key}</span>
					<span className="text-[11px] text-dim">
						{step.status}
						{step.attempt > 1 ? ` (attempt ${step.attempt})` : ''}
					</span>
					<span className="font-data ml-auto text-[11px] text-dim">
						{formatDuration(step.started_at, step.finished_at)}
					</span>
					{step.error_message ? (
						<span className="max-w-64 truncate text-[11px] text-oxide" title={step.error_message}>
							{step.error_message}
						</span>
					) : null}
				</div>
			))}
		</div>
	)
}
