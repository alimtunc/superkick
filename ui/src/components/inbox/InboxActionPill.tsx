import type { InboxAction } from '@/types'
import { ArrowUpRight } from 'lucide-react'

interface InboxActionPillProps {
	action: InboxAction
	/** When true, the pill renders in a muted style (secondary slot). */
	muted?: boolean
}

export function InboxActionPill({ action, muted = false }: InboxActionPillProps) {
	const tone = muted ? 'text-ash group-hover:text-silver' : 'text-fog group-hover:text-neon-green'
	return (
		<span
			className={`font-data inline-flex items-center gap-1 text-[10px] tracking-wider uppercase ${tone}`}
		>
			<span>{action.label}</span>
			<ArrowUpRight size={10} strokeWidth={1.75} aria-hidden="true" />
		</span>
	)
}
