import type { ReactNode } from 'react'

import type { TakeoverModeAvailability, TakeoverModeKind } from '@/types'

interface TerminalTakeoverModeButtonProps {
	availability: TakeoverModeAvailability
	icon: ReactNode
	label: string
	description: string
	pending: boolean
	onSelect: (mode: TakeoverModeKind) => void
}

const SUB_LABEL: Record<TakeoverModeKind, string> = {
	inspect: 'Read-only shell',
	interactive_continuation: 'Continue conversation',
	force_takeover: 'Cancel turn, then take over'
}

export function TerminalTakeoverModeButton({
	availability,
	icon,
	label,
	description,
	pending,
	onSelect
}: TerminalTakeoverModeButtonProps) {
	const disabled = !availability.available || pending
	const reason = availability.reason
	const showResumeBadge = availability.mode === 'interactive_continuation'

	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => onSelect(availability.mode)}
			className="group flex w-full items-start gap-3 rounded-md border border-border bg-surface/30 p-3 text-left transition-colors hover:border-success/40 hover:bg-surface/60 focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-surface/30"
		>
			<span aria-hidden="true" className="mt-0.5 text-fg-dim group-hover:text-fg-muted">
				{icon}
			</span>
			<span className="flex flex-1 flex-col">
				<span className="font-data flex items-center gap-2 text-[11px] tracking-wider text-fg-muted uppercase">
					{label}
					<span className="font-data text-[10px] text-fg-dim">
						· {SUB_LABEL[availability.mode]}
					</span>
				</span>
				<span className="font-data mt-1 text-[11px] text-fg-dim">{description}</span>
				{showResumeBadge ? (
					<span
						className={`font-data mt-2 inline-flex w-fit rounded-sm border px-1.5 py-0.5 text-[10px] tracking-wider uppercase ${
							availability.resume_supported
								? 'border-evergreen/40 text-evergreen'
								: 'border-border text-fg-dim'
						}`}
					>
						{availability.resume_supported ? 'Resume available' : 'Resume not supported'}
					</span>
				) : null}
				{!availability.available && reason ? (
					<span className="font-data mt-2 text-[10px] text-fg-dim italic">
						Unavailable: {reason}
					</span>
				) : null}
			</span>
		</button>
	)
}
