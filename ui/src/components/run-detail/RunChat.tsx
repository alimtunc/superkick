import type { ReactNode } from 'react'

import { Avatar } from '@/ui/Avatar'

type RunChatFrom = 'user' | 'agent' | 'system'

interface RunChatProps {
	from: RunChatFrom
	who: ReactNode
	time?: ReactNode
	badge?: ReactNode
	children?: ReactNode
}

function chatAvatar(from: RunChatFrom, who: ReactNode): ReactNode {
	if (from === 'user') {
		const name = typeof who === 'string' ? who : 'You'
		return <Avatar name={name} tone="accent" size={24} />
	}
	if (from === 'system') return <Avatar icon="zap" tone="info" size={24} />
	return <Avatar icon="bot" tone="neutral" size={24} />
}

export function RunChat({ from, who, time, badge, children }: RunChatProps) {
	const isUser = from === 'user'

	return (
		<div className="flex gap-3 px-6 py-4">
			<div className="pt-0.5">{chatAvatar(from, who)}</div>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
					<span className="text-[12.5px] font-medium text-fg">{who}</span>
					{badge}
					{time ? <span className="font-data text-[11px] text-fg-dim">{time}</span> : null}
				</div>
				{children ? (
					<div className="mt-1.5">
						{isUser ? (
							<div className="inline-block max-w-full rounded-md bg-raised px-3 py-2 text-[13px] leading-relaxed break-words whitespace-pre-wrap text-fg">
								{children}
							</div>
						) : (
							<div className="text-[13px] leading-relaxed text-fg-muted">{children}</div>
						)}
					</div>
				) : null}
			</div>
		</div>
	)
}
