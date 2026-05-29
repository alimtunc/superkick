import type { ReactNode } from 'react'

import { AgentPill } from '@/components/issue-detail/AgentPill'
import type { ActivityNodeKind, ActivityNodeRole } from '@/types'
import type { SKIconName } from '@/types/icons'
import { Icon } from '@/ui'

interface IssueTimelineEventProps {
	kind: ActivityNodeKind
	role?: ActivityNodeRole
	who: ReactNode
	time?: ReactNode
	isAgent?: boolean
	isLast?: boolean
	children?: ReactNode
}

const ICON: Record<ActivityNodeKind, SKIconName> = {
	agent: 'bot',
	user: 'user',
	commit: 'branch',
	check: 'check',
	flag: 'flag',
	system: 'zap',
	pr: 'pr'
}

const NODE_TONE: Record<ActivityNodeRole, string> = {
	neutral: '',
	accent: 'accent',
	success: 'success',
	warn: 'warn',
	danger: 'warn',
	info: 'accent'
}

export function IssueTimelineEvent({
	kind,
	role = 'neutral',
	who,
	time,
	isAgent = false,
	children
}: IssueTimelineEventProps) {
	const tone = NODE_TONE[role]
	return (
		<div className="feeditem">
			<div className="feeditem__node">
				<span className={`node-glyph${tone ? ` ${tone}` : ''}`}>
					<Icon name={ICON[kind] ?? 'doc'} size={13} className="ic" />
				</span>
			</div>
			<div className="sysevent">
				<span>
					<strong>{who}</strong>
					{isAgent ? (
						<>
							{' '}
							<AgentPill />{' '}
						</>
					) : (
						' '
					)}
					{children}
				</span>
				{time ? <span className="ts">· {time}</span> : null}
			</div>
		</div>
	)
}
