import { Pill } from '@/components/ui/pill'
import { LAUNCH_TASK_STATUS_LABEL, LAUNCH_TASK_STATUS_TONE } from '@/lib/domain'
import type { LaunchTask } from '@/types'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'

interface TaskCockpitHeaderProps {
	task: LaunchTask
}

export function TaskCockpitHeader({ task }: TaskCockpitHeaderProps) {
	const status = task.status
	const hasIssue = task.linear_issue_id.trim().length > 0
	const summary = task.summary?.trim() || 'Launch task'

	return (
		<header className="bg-carbon-dim/40 flex items-center gap-3 border-b border-edge px-6 py-3">
			<div className="flex min-w-0 flex-1 items-center gap-2">
				{hasIssue ? (
					<Link
						to="/issues/$issueId"
						params={{ issueId: task.linear_issue_id }}
						className="inline-flex items-center gap-1 rounded-md focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
						aria-label={`Open parent issue ${task.linear_issue_id}`}
						title={`Open parent issue ${task.linear_issue_id}`}
					>
						<Pill mono size="xs" interactive>
							{task.linear_issue_id}
						</Pill>
						<ArrowUpRight
							size={12}
							strokeWidth={1.85}
							className="text-fg-dim"
							aria-hidden="true"
						/>
					</Link>
				) : null}
				<span className="truncate text-[13px] text-fg" title={summary}>
					{summary}
				</span>
			</div>
			<Pill tone={LAUNCH_TASK_STATUS_TONE[status]} size="xs" dot pulse={status === 'running'}>
				{LAUNCH_TASK_STATUS_LABEL[status]}
			</Pill>
		</header>
	)
}
