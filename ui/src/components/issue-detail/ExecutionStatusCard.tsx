import { useState } from 'react'

import { CompactTaskRunRow } from '@/components/issue-detail/CompactTaskRunRow'
import { TaskRunRow } from '@/components/issue-detail/TaskRunRow'
import { useIssueLaunchTasks } from '@/hooks/useIssueLaunchTasks'
import { isActiveRun, pickLatestRun, pickLinkedRunId, pickRunForTask } from '@/lib/domain'
import { cn } from '@/lib/utils'
import { useRunDrawerStore } from '@/stores/runDrawer'
import type { IssueDetailResponse } from '@/types'
import { Link } from '@tanstack/react-router'
import { Zap } from 'lucide-react'

interface ExecutionStatusCardProps {
	issue: IssueDetailResponse
}

export function ExecutionStatusCard({ issue }: ExecutionStatusCardProps) {
	const { activeTask, tasksWithSteps } = useIssueLaunchTasks(issue.identifier)
	const activeRun = issue.linked_runs.find(isActiveRun)
	const latestRun = pickLatestRun(issue.linked_runs)
	const drawerRun = activeRun ?? latestRun
	const openDrawer = useRunDrawerStore((s) => s.openDrawer)
	const [historyExpanded, setHistoryExpanded] = useState(false)

	const taskCount = tasksWithSteps.length
	const [latest, ...older] = tasksWithSteps

	return (
		<section aria-label="Tasks" className="rounded-md border border-border bg-surface px-3 py-3">
			<header className="mb-2 flex items-center gap-2">
				<Zap size={13} strokeWidth={1.85} className="text-accent" aria-hidden="true" />
				<span className="text-[13px] font-semibold text-fg">Tasks</span>
				<span className="font-data text-[11px] text-fg-dim">{taskCount}</span>
				<span className="font-data ml-auto text-[11px] text-fg-dim">Newest first</span>
			</header>
			{latest ? (
				<TaskRunRow
					task={latest.task}
					run={pickRunForTask(latest, drawerRun)}
					active={Boolean(activeRun)}
					taskFinished={!activeTask}
					onOpenDrawer={drawerRun ? () => openDrawer(drawerRun.id, 'activity') : undefined}
				/>
			) : (
				<p className="py-2 text-[12.5px] leading-5 text-fg-muted">No task on this issue.</p>
			)}
			{older.length > 0 ? (
				<div className="mt-2">
					<button
						type="button"
						onClick={() => setHistoryExpanded((v) => !v)}
						className="font-data inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
						aria-expanded={historyExpanded}
					>
						{historyExpanded ? 'Hide history' : `Show history (${older.length})`}
					</button>
					{historyExpanded ? (
						<ul className="mt-2 space-y-1.5">
							{older.map((entry) => {
								const linkedRunId = pickLinkedRunId(entry.steps)
								return (
									<li key={entry.task.id}>
										<CompactTaskRunRow
											task={entry.task}
											linkedRunId={linkedRunId}
											onOpenDrawer={
												linkedRunId
													? () => openDrawer(linkedRunId, 'activity')
													: undefined
											}
										/>
									</li>
								)
							})}
						</ul>
					) : null}
				</div>
			) : null}
			<Link
				to="/tasks/new"
				search={{ issue: issue.identifier }}
				className={cn(
					'mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border text-[12.5px] font-medium transition-colors',
					activeRun
						? 'bg-transparent text-fg hover:bg-raised'
						: 'border-transparent bg-accent text-white hover:opacity-90'
				)}
			>
				<Zap size={12} strokeWidth={1.9} aria-hidden="true" />
				{activeRun ? 'Launch another' : 'Launch task'}
			</Link>
		</section>
	)
}
