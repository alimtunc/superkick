import { Pill, type PillTone } from '@/components/ui/pill'
import { issueStateAccent } from '@/lib/domain'
import type { IssueState } from '@/types'

interface IssueStatePillProps {
	state: IssueState
	size?: 'xs' | 'sm'
}

const stateTone: Record<IssueState, PillTone> = {
	backlog: 'neutral',
	todo: 'neutral',
	in_progress: 'cyan',
	needs_human: 'oxide',
	in_review: 'violet',
	done: 'mineral'
}

export function IssueStatePill({ state, size = 'xs' }: IssueStatePillProps) {
	const accent = issueStateAccent[state]
	const Icon = accent.icon

	return (
		<Pill
			tone={stateTone[state]}
			size={size}
			shape="round"
			title={accent.description}
			leading={<Icon size={11} aria-hidden="true" />}
		>
			{accent.label}
		</Pill>
	)
}
