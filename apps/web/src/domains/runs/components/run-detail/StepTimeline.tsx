import { Icon, Pill, type PillTone } from '@/components/primitives'
import { fmtDuration, stepLabel } from '@/lib/domain'
import type { RunStep, StepStatus } from '@/types'

const STATUS_TONE: Record<StepStatus, PillTone> = {
	pending: 'neutral',
	running: 'accent',
	succeeded: 'success',
	failed: 'danger',
	skipped: 'neutral'
}

const STATUS_LABEL: Record<StepStatus, string> = {
	pending: 'Pending',
	running: 'Running',
	succeeded: 'Succeeded',
	failed: 'Failed',
	skipped: 'Skipped'
}

function StepGlyph({ status }: { status: StepStatus }) {
	if (status === 'succeeded') {
		return (
			<span className="flex w-4.5 justify-center text-success">
				<Icon name="check" size={15} className="ic" />
			</span>
		)
	}
	if (status === 'running') {
		return (
			<span className="flex w-4.5 justify-center">
				<span className="agdot agdot--running" style={{ width: 10, height: 10 }} />
			</span>
		)
	}
	if (status === 'failed') {
		return (
			<span className="flex w-4.5 justify-center text-danger">
				<Icon name="x" size={15} className="ic" />
			</span>
		)
	}
	return (
		<span className="flex w-4.5 justify-center text-fg-faint">
			<Icon name="clock" size={15} className="ic" />
		</span>
	)
}

function metaFor(step: RunStep): string {
	const parts: string[] = []
	if (step.agent_provider) parts.push(step.agent_provider)
	if (step.started_at) {
		const ms =
			(step.finished_at ? new Date(step.finished_at).getTime() : Date.now()) -
			new Date(step.started_at).getTime()
		parts.push(step.status === 'running' ? 'live' : fmtDuration(ms))
	}
	if (step.attempt > 1) parts.push(`attempt ${step.attempt}`)
	return parts.length > 0 ? parts.join(' · ') : '—'
}

export function StepTimeline({ steps }: { steps: RunStep[] }) {
	if (steps.length === 0) return <p className="font-data text-sm text-fg-dim">No progress yet.</p>

	return (
		<div className="steplist">
			{steps.map((step) => (
				<div key={step.id} className="stepitem">
					<StepGlyph status={step.status} />
					<span
						className="stepitem__key"
						style={step.status === 'pending' ? { color: 'var(--fg-dim)' } : undefined}
					>
						{stepLabel[step.step_key] ?? step.step_key}
					</span>
					<Pill tone={STATUS_TONE[step.status]} size="xs">
						{STATUS_LABEL[step.status]}
					</Pill>
					{step.error_message ? (
						<span
							className="max-w-64 truncate text-[11px] text-danger"
							title={step.error_message}
						>
							{step.error_message}
						</span>
					) : null}
					<span className="stepitem__meta">{metaFor(step)}</span>
				</div>
			))}
		</div>
	)
}
