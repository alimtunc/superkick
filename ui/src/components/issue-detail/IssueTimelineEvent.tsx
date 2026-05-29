import type { ReactNode } from 'react'

import { AgentPill } from '@/components/issue-detail/AgentPill'
import type { ActivityNodeKind, ActivityNodeRole } from '@/types'
import { Bot, Check, FileText, Flag, GitCommit, GitPullRequest, User, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface IssueTimelineEventProps {
	kind: ActivityNodeKind
	role?: ActivityNodeRole
	who: ReactNode
	time?: ReactNode
	isAgent?: boolean
	isLast?: boolean
	children?: ReactNode
}

const ICON: Record<ActivityNodeKind, LucideIcon> = {
	agent: Bot,
	user: User,
	commit: GitCommit,
	check: Check,
	flag: Flag,
	system: Zap,
	pr: GitPullRequest
}

const ROLE_TEXT: Record<ActivityNodeRole, string> = {
	neutral: 'text-fg-dim',
	accent: 'text-accent',
	success: 'text-success',
	warn: 'text-warn',
	danger: 'text-danger',
	info: 'text-info'
}

export function IssueTimelineEvent({
	kind,
	role = 'neutral',
	who,
	time,
	isAgent = false,
	isLast = false,
	children
}: IssueTimelineEventProps) {
	const Cmp = ICON[kind] ?? FileText
	return (
		<div className="flex gap-2.5">
			<div className="flex flex-col items-center">
				<span
					className="inline-flex size-6.5 shrink-0 items-center justify-center rounded-full border border-border bg-surface"
					aria-hidden="true"
				>
					<Cmp size={12} strokeWidth={1.9} className={ROLE_TEXT[role]} />
				</span>
				{isLast ? null : <span className="mt-1 w-px grow bg-border" aria-hidden="true" />}
			</div>
			<div
				className={`min-w-0 flex-1 pt-1 text-[12.5px] leading-[1.55] text-fg-muted ${isLast ? '' : 'pb-4'}`}
			>
				<span className="mr-1 font-medium text-fg">{who}</span>
				{isAgent ? (
					<>
						<AgentPill />{' '}
					</>
				) : null}
				{children}
				{time ? <span className="ml-1 text-[11px] text-fg-dim">· {time}</span> : null}
			</div>
		</div>
	)
}
