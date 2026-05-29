import { Pill } from '@/components/ui/pill'
import type { LaunchTask } from '@/types'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, MessagesSquare } from 'lucide-react'

interface TaskCockpitParentBannerProps {
	task: LaunchTask
}

export function TaskCockpitParentBanner({ task }: TaskCockpitParentBannerProps) {
	const issueIdentifier = task.linear_issue_id.trim()
	if (!issueIdentifier) return null
	return (
		<div className="flex items-center gap-3 border-b border-border bg-surface/40 px-6 py-2.5">
			<MessagesSquare
				size={13}
				strokeWidth={1.75}
				className="shrink-0 text-fg-dim"
				aria-hidden="true"
			/>
			<span className="text-[12px] text-fg-muted">Decisions for this task live on its issue</span>
			<Link
				to="/issues/$issueId"
				params={{ issueId: issueIdentifier }}
				className="ml-auto inline-flex items-center gap-1 rounded-md focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				aria-label={`Open parent issue ${issueIdentifier}`}
				title={`Open parent issue ${issueIdentifier}`}
			>
				<Pill mono size="xs" interactive>
					{issueIdentifier}
				</Pill>
				<ArrowUpRight size={12} strokeWidth={1.85} className="text-fg-dim" aria-hidden="true" />
			</Link>
		</div>
	)
}
