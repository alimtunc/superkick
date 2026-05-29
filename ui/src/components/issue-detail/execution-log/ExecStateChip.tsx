import { cn } from '@/lib/utils'
import type { SKTone } from '@/types/icons'

interface ExecStateChipProps {
	tone: SKTone
	label: string
	pulse?: boolean
}

const TONE_CLASS: Record<SKTone, string> = {
	neutral: 'bg-raised text-fg-muted',
	accent: 'bg-accent-soft text-accent',
	success: 'bg-success-soft text-success',
	warn: 'bg-warn-soft text-warn',
	danger: 'bg-danger-soft text-danger',
	info: 'bg-info-soft text-info'
}

const DOT_CLASS: Record<SKTone, string> = {
	neutral: 'bg-fg-dim',
	accent: 'bg-accent',
	success: 'bg-success',
	warn: 'bg-warn',
	danger: 'bg-danger',
	info: 'bg-info'
}

export function ExecStateChip({ tone, label, pulse }: ExecStateChipProps) {
	return (
		<span
			className={cn(
				'inline-flex h-[19px] items-center gap-1.5 rounded px-[7px] text-[11px] font-medium',
				TONE_CLASS[tone]
			)}
		>
			<span
				className={cn(
					'inline-block size-1.5 shrink-0 rounded-full',
					DOT_CLASS[tone],
					pulse ? 'sk-pulse motion-reduce:animate-none' : null
				)}
				aria-hidden="true"
			/>
			{label}
		</span>
	)
}
