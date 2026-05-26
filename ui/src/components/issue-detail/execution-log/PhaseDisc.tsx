import { cn } from '@/lib/utils'
import type { Phase, PhaseStatus } from '@/types'
import { Check, Loader2, X } from 'lucide-react'

interface PhaseDiscProps {
	phase: Phase
	label: string
}

const STATUS_CLASS: Record<PhaseStatus, string> = {
	done: 'border-success/40 bg-success-soft text-success',
	active: 'border-accent/50 bg-accent-soft text-accent',
	paused: 'border-warn/40 bg-warn-soft text-warn',
	failed: 'border-danger/40 bg-danger-soft text-danger',
	pending: 'border-border bg-surface text-fg-dim'
}

const STATUS_LABEL: Record<PhaseStatus, string> = {
	done: 'done',
	active: 'in progress',
	paused: 'paused',
	failed: 'failed',
	pending: 'pending'
}

function StatusGlyph({ status }: { status: PhaseStatus }) {
	if (status === 'done') return <Check size={11} strokeWidth={2.2} aria-hidden="true" />
	if (status === 'failed') return <X size={11} strokeWidth={2.2} aria-hidden="true" />
	if (status === 'active')
		return <Loader2 size={11} strokeWidth={2.2} className="animate-spin" aria-hidden="true" />
	return null
}

export function PhaseDisc({ phase, label }: PhaseDiscProps) {
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
				<StatusGlyph status={phase.status} />
			</span>
			<span className="text-[11.5px] text-fg-muted">{label}</span>
		</div>
	)
}
