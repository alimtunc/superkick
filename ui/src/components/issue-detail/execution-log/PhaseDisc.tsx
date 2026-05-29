import { cn } from '@/lib/utils'
import type { Phase, PhaseStatus } from '@/types'
import { Check, Pause, X } from 'lucide-react'

const STATUS_CLASS: Record<PhaseStatus, string> = {
	done: 'border-success bg-[color-mix(in_srgb,var(--color-success)_20%,transparent)] text-success',
	active: 'border-info bg-[color-mix(in_srgb,var(--color-info)_22%,transparent)] text-info',
	paused: 'border-warn bg-[color-mix(in_srgb,var(--color-warn)_22%,transparent)] text-warn',
	failed: 'border-danger bg-[color-mix(in_srgb,var(--color-danger)_20%,transparent)] text-danger',
	pending: 'border-border-strong bg-transparent text-fg-dim'
}

const STATUS_LABEL: Record<PhaseStatus, string> = {
	done: 'done',
	active: 'in progress',
	paused: 'paused',
	failed: 'failed',
	pending: 'pending'
}

function StatusGlyph({ status, index }: { status: PhaseStatus; index: number }) {
	if (status === 'done') return <Check size={10} strokeWidth={2.5} aria-hidden="true" />
	if (status === 'failed') return <X size={9} strokeWidth={2.5} aria-hidden="true" />
	if (status === 'paused') return <Pause size={8} strokeWidth={2.5} aria-hidden="true" />
	if (status === 'active')
		return <span className="block size-1.5 rounded-full bg-info" aria-hidden="true" />
	return <span className="font-data text-[9.5px] leading-none">{index + 1}</span>
}

interface PhaseDiscProps {
	phase: Phase
	label: string
	index: number
}

export function PhaseDisc({ phase, label, index }: PhaseDiscProps) {
	const emphasized = phase.status === 'active' || phase.status === 'paused'

	return (
		<div
			role="group"
			aria-label={`${label} ${STATUS_LABEL[phase.status]}`}
			className="flex items-center gap-1.5"
		>
			<span
				className={cn(
					'relative inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px]',
					STATUS_CLASS[phase.status],
					phase.status === 'active' ? 'sk-pulse motion-reduce:animate-none' : null
				)}
				style={
					phase.status === 'active'
						? { boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-info) 18%, transparent)' }
						: undefined
				}
				aria-hidden="true"
			>
				<StatusGlyph status={phase.status} index={index} />
			</span>
			<span
				className={cn(
					'text-[12px]',
					emphasized ? 'font-semibold' : 'font-medium',
					phase.status === 'pending' ? 'text-fg-muted' : 'text-fg'
				)}
			>
				{label}
			</span>
			{phase.meta ? <span className="text-[11px] text-fg-dim">· {phase.meta}</span> : null}
		</div>
	)
}
