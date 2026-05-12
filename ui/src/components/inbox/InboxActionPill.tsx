import type { InboxAction } from '@/types'
import { Icon } from '@/ui/Icon'

interface InboxActionPillProps {
	action: InboxAction
	muted?: boolean
}

export function InboxActionPill({ action, muted = false }: InboxActionPillProps) {
	const tone = muted ? 'text-fg-dim group-hover:text-fg-muted' : 'text-fg-muted group-hover:text-fg'
	return (
		<span
			className={`inline-flex items-center gap-1 font-mono text-[11px] tracking-wider uppercase ${tone}`}
		>
			<span>{action.label}</span>
			<Icon name="arrowRight" size={11} />
		</span>
	)
}
