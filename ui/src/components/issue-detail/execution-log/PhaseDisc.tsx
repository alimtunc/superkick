import { cn } from '@/lib/utils'
import type { Phase, PhaseStatus } from '@/types'
import { Check, X } from 'lucide-react'

interface PhaseDiscProps {
	phase: Phase
	label: string
	index: number
}

const STATUS_CLASS: Record<PhaseStatus, string> = {
	done: 'border-success/50 bg-success-soft text-success',
	active: 'border-transparent bg-accent text-white',
	paused: 'border-warn/40 bg-warn-soft text-warn',
	failed: 'border-danger/40 bg-danger-soft text-danger',
	pending: 'border-border bg-transparent text-fg-dim'
}

const STATUS_LABEL: Record<PhaseStatus, string> = {
	done: 'done',
	active: 'in progress',
	paused: 'paused',
	failed: 'failed',
	pending: 'pending'
}

function StatusGlyph({ status, index }: { status: PhaseStatus; index: number }) {
	if (status === 'done') return <Check size={11} strokeWidth={2.4} aria-hidden="true" />
	if (status === 'failed') return <X size={11} strokeWidth={2.4} aria-hidden="true" />
	if (status === 'active')
		return <span className="block size-1.5 rounded-full bg-white" aria-hidden="true" />
	return <span className="font-data text-[10px] leading-none">{index + 1}</span>
}

export function PhaseDisc({ phase, label, index }: PhaseDiscProps) {
	return (
		<div
			role="group"
			aria-label={`${label} ${STATUS_LABEL[phase.status]}`}
			className="flex items-center gap-1.5"
		>
			<span
				className={cn(
					'inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border',
					STATUS_CLASS[phase.status]
				)}
				aria-hidden="true"
			>
				<StatusGlyph status={phase.status} index={index} />
			</span>
			<span className="text-[12px] text-fg">{label}</span>
		</div>
	)
}
