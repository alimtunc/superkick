import type { ReactNode } from 'react'

import type { ActivityNodeKind, ActivityNodeRole } from '@/types'
import { Bot, Check, FileText, Flag, GitCommit, GitPullRequest, User, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ActivityNodeProps {
	kind: ActivityNodeKind
	role?: ActivityNodeRole
	who: ReactNode
	time?: ReactNode
	link?: ReactNode
	connect?: boolean
	disc?: ReactNode
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

const DISC_TONE: Record<ActivityNodeRole, string> = {
	neutral: 'bg-raised text-fg-muted',
	accent: 'bg-accent-soft text-accent',
	success: 'bg-success-soft text-success',
	warn: 'bg-warn-soft text-warn',
	danger: 'bg-danger-soft text-danger',
	info: 'bg-info-soft text-info'
}

function DefaultDisc({ kind, role }: { kind: ActivityNodeKind; role: ActivityNodeRole }) {
	const Cmp = ICON[kind] ?? FileText
	return (
		<span
			className={`inline-flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full ${DISC_TONE[role]}`}
			aria-hidden="true"
		>
			<Cmp size={12} strokeWidth={1.9} />
		</span>
	)
}

export function ActivityNode({
	kind,
	role = 'neutral',
	who,
	time,
	link,
	connect = true,
	disc,
	children
}: ActivityNodeProps) {
	return (
		<div className="relative flex gap-3 pb-5">
			{connect ? (
				<span
					aria-hidden="true"
					className="absolute top-7 bottom-0 left-2.5 w-px -translate-x-1/2 bg-border"
				/>
			) : null}
			<div className="relative z-10 pt-0.5">{disc ?? <DefaultDisc kind={kind} role={role} />}</div>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px] text-fg">
					<span className="font-medium">{who}</span>
					{link}
					{time ? <span className="font-data text-[11px] text-fg-dim">{time}</span> : null}
				</div>
				{children ? (
					<div className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{children}</div>
				) : null}
			</div>
		</div>
	)
}
