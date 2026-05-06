import { Pill } from '@/components/ui/pill'
import { conversationStateTone } from '@/lib/domain'
import type { ConversationUxState } from '@/types'

export function ConversationStateBadge({ state }: { state: ConversationUxState }) {
	return (
		<Pill tone={conversationStateTone[state]} size="xs">
			{state.replace(/_/g, ' ')}
		</Pill>
	)
}
