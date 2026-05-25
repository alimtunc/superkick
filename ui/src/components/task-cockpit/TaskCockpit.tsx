import { useMemo, useState } from 'react'

import { LaunchPlanStrip } from '@/components/launch/LaunchPlanStrip'
import { TaskCockpitNowPanel } from '@/components/task-cockpit/TaskCockpitNowPanel'
import { TaskCockpitParentBanner } from '@/components/task-cockpit/TaskCockpitParentBanner'
import { TaskCockpitTabPanel } from '@/components/task-cockpit/TaskCockpitTabPanel'
import { TaskCockpitTabs, type TaskCockpitTabId } from '@/components/task-cockpit/TaskCockpitTabs'
import { TaskCockpitTimeline } from '@/components/task-cockpit/TaskCockpitTimeline'
import { Pill } from '@/components/ui/pill'
import { useEventStream } from '@/hooks/useEventStream'
import { useLaunchTaskFeedState } from '@/hooks/useLaunchTaskFeedState'
import { LAUNCH_TASK_STATUS_LABEL, LAUNCH_TASK_STATUS_TONE, fmtRelativeTime } from '@/lib/domain'
import { TopbarBackButton } from '@/shell/TopbarBackButton'
import { usePageActions } from '@/shell/usePageActions'
import type { LaunchTask, LaunchTaskStep } from '@/types'

interface TaskCockpitProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
}

export function TaskCockpit({ task, steps }: TaskCockpitProps) {
	const [activeTab, setActiveTab] = useState<TaskCockpitTabId>('activity')
	const {
		blocking,
		canRetry,
		isTerminal,
		terminalKind,
		hideCallout,
		finalStep,
		finalClassification,
		linkedRunId,
		worktreePath,
		branchName,
		pr,
		interventions
	} = useLaunchTaskFeedState(task, steps)
	const stream = useEventStream(linkedRunId)

	const status = task.status
	const issueId = task.linear_issue_id.trim()
	const title = task.summary?.trim() || issueId || 'Launch task'
	const updated = fmtRelativeTime(task.updated_at)

	const sub = useMemo(
		() => (
			<>
				<Pill tone={LAUNCH_TASK_STATUS_TONE[status]} size="md" dot pulse={status === 'running'}>
					{LAUNCH_TASK_STATUS_LABEL[status]}
				</Pill>
				<span className="text-[12px] text-fg-dim">· updated {updated}</span>
			</>
		),
		[status, updated]
	)

	usePageActions({
		title,
		sub,
		back: <TopbarBackButton fallbackTo={issueId ? `/issues/${issueId}` : '/'} />
	})

	return (
		<div className="flex h-full min-h-0 flex-col">
			<LaunchPlanStrip task={task} steps={steps} variant="stepper" />
			<TaskCockpitParentBanner task={task} />
			<TaskCockpitTabs steps={steps} activeTab={activeTab} onChangeTab={setActiveTab} />
			<div className="flex min-h-0 flex-1">
				{activeTab === 'activity' ? (
					<TaskCockpitTimeline
						task={task}
						steps={steps}
						blocking={blocking}
						canRetry={canRetry}
						terminalKind={terminalKind}
						hideCallout={hideCallout}
						finalStep={finalStep}
						finalClassification={finalClassification}
						linkedRunId={linkedRunId}
						worktreePath={worktreePath}
						branchName={branchName}
						interventions={interventions}
						runEvents={stream.events}
					/>
				) : (
					<TaskCockpitTabPanel tab={activeTab} steps={steps} linkedRunId={linkedRunId} />
				)}
				<TaskCockpitNowPanel
					task={task}
					steps={steps}
					isTerminal={isTerminal}
					linkedRunId={linkedRunId}
					worktreePath={worktreePath}
					branchName={branchName}
					pr={pr}
				/>
			</div>
		</div>
	)
}
