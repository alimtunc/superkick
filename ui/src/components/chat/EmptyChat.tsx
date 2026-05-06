import type { ReactNode } from 'react'

import { EmptyState } from '@/components/ui/state-empty'
import { MessagesSquare } from 'lucide-react'

interface EmptyChatProps {
	/**
	 * Bottom-anchored launcher (`NewChatLauncher`). Mirrors the conversation
	 * view's "transcript on top, composer pinned to the bottom" rhythm so the
	 * operator's eye lands in the same place when they switch between empty
	 * and active conversations.
	 */
	launcher?: ReactNode
}

export function EmptyChat({ launcher }: EmptyChatProps) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex flex-1 items-center justify-center p-8">
				<EmptyState
					icon={MessagesSquare}
					title="Start a conversation"
					description="Pick a provider and ask anything about this issue or run. Each conversation persists separately."
					className="border-0"
				/>
			</div>
			{launcher ? <div className="border-t border-edge p-3">{launcher}</div> : null}
		</div>
	)
}
