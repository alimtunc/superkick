import { useState } from 'react'

import { RUN_SESSION_TAB_ITEMS, type RunSessionTab } from '@/components/run-tabs/runSessionTabItems'
import { RunSessionTabs } from '@/components/run-tabs/RunSessionTabs'
import { StepFocusSelector } from '@/components/task-cockpit/StepFocusSelector'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { TabBar } from '@/components/ui/tab-bar'
import { useRunSession } from '@/hooks/useRunSession'
import { useStickToBottom } from '@/hooks/useStickToBottom'
import { runStepIdForLaunchStep } from '@/lib/launch/runStepMap'
import type { LaunchTaskStep } from '@/types'

interface TaskSessionViewProps {
	runId: string
	steps: readonly LaunchTaskStep[]
}

// The shadow run as a structured session; the step selector scopes
// Activity/Tools/Logs to one step's run_step_id ("All steps" shows the run).
export function TaskSessionView({ runId, steps }: TaskSessionViewProps) {
	const session = useRunSession(runId)
	const [activeTab, setActiveTab] = useState<RunSessionTab>('activity')
	const [selectedStepId, setSelectedStepId] = useState<string | null>(null)
	const body = useStickToBottom<HTMLDivElement>(`${activeTab}:${session.events.length}`)

	if (session.loading) {
		return (
			<div className="min-h-0 flex-1 px-4 py-6">
				<LoadingState rows={4} />
			</div>
		)
	}

	if (session.error) {
		return (
			<div className="min-h-0 flex-1 px-4 py-6">
				<ErrorState
					title="Session load failed"
					message={session.error}
					onRetry={() => session.refresh()}
				/>
			</div>
		)
	}

	if (!session.run) {
		return (
			<div className="min-h-0 flex-1 px-4 py-6">
				<ErrorState
					title="Run not found"
					message="The shadow run for this launch task may have been deleted."
				/>
			</div>
		)
	}

	const selectedStep = selectedStepId ? (steps.find((step) => step.id === selectedStepId) ?? null) : null
	const scopedRunStepId = selectedStep ? runStepIdForLaunchStep(selectedStep, steps, session.steps) : null
	const scopedEvents = scopedRunStepId
		? session.events.filter((event) => event.run_step_id === scopedRunStepId)
		: session.events

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<StepFocusSelector steps={steps} selectedStepId={selectedStepId} onSelect={setSelectedStepId} />
			<TabBar
				tabs={RUN_SESSION_TAB_ITEMS}
				activeId={activeTab}
				onChange={setActiveTab}
				ariaLabel="Run session"
				className="border-border bg-surface"
			/>
			<div className="min-h-0 flex-1 overflow-y-auto" ref={body.ref} onScroll={body.onScroll}>
				<RunSessionTabs
					tab={activeTab}
					onSelectTab={setActiveTab}
					runId={runId}
					run={session.run}
					pr={session.pr}
					sessions={session.sessions}
					attentionRequests={session.attentionRequests}
					events={scopedEvents}
					isTerminal={session.isTerminal}
				/>
			</div>
		</div>
	)
}
