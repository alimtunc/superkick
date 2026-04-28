import { v1IssueStateAccent } from '@/lib/domain'
import type { V1IssueState } from '@/types'

interface V1StatePillProps {
	state: V1IssueState
	size?: 'xs' | 'sm'
}

export function V1StatePill({ state, size = 'xs' }: V1StatePillProps) {
	const accent = v1IssueStateAccent[state]
	const Icon = accent.icon
	const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[10px]'

	return (
		<span
			className={`font-data inline-flex shrink-0 items-center gap-1 rounded-full border border-edge bg-slate-deep/40 ${sizeClass} ${accent.text}`}
			title={accent.description}
		>
			<Icon size={11} aria-hidden="true" />
			{accent.label}
		</span>
	)
}
