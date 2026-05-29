import { Pill } from '@/components/ui/pill'
import { issueStateAccent, issueStateTone } from '@/lib/domain'
import type { IssueState } from '@/types'

interface IssueStatePillProps {
	state: IssueState
	size?: 'xs' | 'sm'
}

export function IssueStatePill({ state, size = 'xs' }: IssueStatePillProps) {
	const accent = issueStateAccent[state]

	return (
		<Pill tone={issueStateTone[state]} size={size} dot title={accent.description}>
			{accent.label}
		</Pill>
	)
}
