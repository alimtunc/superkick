import { useState } from 'react'

import { RunSessionGate } from '@/components/run-shared/RunSessionGate'
import { RUN_SESSION_TAB_ITEMS, type RunSessionTab } from '@/components/run-tabs/runSessionTabItems'
import { RunSessionTabs } from '@/components/run-tabs/RunSessionTabs'
import { StepActionBar } from '@/components/task-cockpit/StepActionBar'
import { StepFocusSelector } from '@/components/task-cockpit/StepFocusSelector'
import { TabBar } from '@/components/ui/tab-bar'
import { useRunSession } from '@/hooks/useRunSession'
import { useStickToBottom } from '@/hooks/useStickToBottom'
import { runStepIdForLaunchStep } from '@/lib/launch/runStepMap'
import type { LaunchTask, LaunchTaskStep } from '@/types'

interface TaskSessionViewProps {
	task: LaunchTask
	runId: string
	steps: readonly LaunchTaskStep[]
}

export function TaskSessionView({ task, runId, steps }: TaskSessionViewProps) {
	const session = useRunSession(runId)
	const [activeTab, setActiveTab] = useState<RunSessionTab>('activity')
	const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
	const body = useStickToBottom<HTMLDivElement>(`${activeTab}:${session.events.length}`)

	return (
		<RunSessionGate
			session={session}
			errorTitle="Session load failed"
			notFoundMessage="The shadow run for this launch task may have been deleted."
			className="min-h-0 flex-1 px-4 py-6"
		>
			{(loaded) => {
				const selectedStep = selectedStepId
					? (steps.find((step) => step.id === selectedStepId) ?? null)
					: null
				const scopedRunStepId = selectedStep
					? runStepIdForLaunchStep(selectedStep, steps, loaded.steps)
					: null
				const scopedEvents = scopedRunStepId
					? loaded.events.filter((event) => event.run_step_id === scopedRunStepId)
					: loaded.events

				return (
					<div className="flex min-h-0 flex-1 flex-col">
						<StepFocusSelector
							steps={steps}
							selectedStepId={selectedStepId}
							onSelect={setSelectedStepId}
						/>
						{selectedStep ? (
							<StepActionBar
								task={task}
								step={selectedStep}
								onTakeover={() => setActiveTab('terminal')}
							/>
						) : null}
						<TabBar
							tabs={RUN_SESSION_TAB_ITEMS}
							activeId={activeTab}
							onChange={setActiveTab}
							ariaLabel="Run session"
							className="border-border bg-surface"
						/>
						<div
							className="min-h-0 flex-1 overflow-y-auto"
							ref={body.ref}
							onScroll={body.onScroll}
						>
							<RunSessionTabs
								tab={activeTab}
								onSelectTab={setActiveTab}
								runId={runId}
								run={loaded.run}
								pr={loaded.pr}
								sessions={loaded.sessions}
								attentionRequests={loaded.attentionRequests}
								events={scopedEvents}
								isTerminal={loaded.isTerminal}
							/>
						</div>
					</div>
				)
			}}
		</RunSessionGate>
	)
}
