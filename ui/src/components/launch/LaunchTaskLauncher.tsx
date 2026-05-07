import { useEffect, useState } from 'react'

import { AgentPicker } from '@/components/launch/AgentPicker'
import { pickDefaultAgent } from '@/components/launch/pickDefaultAgent'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/state-empty'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useAgents } from '@/hooks/useAgents'
import { useCreateLaunchTask } from '@/hooks/useCreateLaunchTask'
import type { Agent, LaunchStepKind } from '@/types'
import { Play, Users } from 'lucide-react'

interface LaunchTaskLauncherProps {
	issueId: string
	linearIssueIdentifier: string
}

const STEPS: { kind: LaunchStepKind; label: string; helper: string }[] = [
	{ kind: 'plan', label: 'Plan', helper: 'Reads the issue and writes a plan.' },
	{ kind: 'implement', label: 'Implement', helper: 'Executes the plan in a worktree.' },
	{ kind: 'review', label: 'Review', helper: 'Reviews the diff before ship.' }
]

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : 'Unknown error'
}

/**
 * SUP-117 — primary launcher on Issue Detail. Renders the
 * Plan → Implement → Review recipe with one `AgentPicker` per step, a submit
 * button, and the empty/loading/error scaffolding shared with the rest of
 * the dashboard. Selection state lives locally — once the mutation succeeds
 * the parent flips to the active-task panel and unmounts this component.
 */
export function LaunchTaskLauncher({ issueId, linearIssueIdentifier }: LaunchTaskLauncherProps) {
	const agentsQuery = useAgents()
	const createLaunchTask = useCreateLaunchTask({ issueId })

	const agentsData = agentsQuery.data
	const agents: readonly Agent[] = agentsData ?? []
	const [selection, setSelection] = useState<Record<LaunchStepKind, string | null>>({
		plan: null,
		implement: null,
		review: null
	})

	useEffect(() => {
		if (!agentsData || agentsData.length === 0) return
		setSelection((current) => {
			const exists = (name: string | null) => name !== null && agentsData.some((a) => a.name === name)
			return {
				plan: exists(current.plan)
					? current.plan
					: (pickDefaultAgent(agentsData, 'plan')?.name ?? null),
				implement: exists(current.implement)
					? current.implement
					: (pickDefaultAgent(agentsData, 'implement')?.name ?? null),
				review: exists(current.review)
					? current.review
					: (pickDefaultAgent(agentsData, 'review')?.name ?? null)
			}
		})
	}, [agentsData])

	if (agentsQuery.isLoading) {
		return <LoadingState rows={3} />
	}

	if (agentsQuery.isError) {
		return (
			<ErrorState
				title="Could not load agents"
				message={errorMessage(agentsQuery.error)}
				onRetry={() => agentsQuery.refetch()}
				density="compact"
			/>
		)
	}

	if (agents.length === 0) {
		return (
			<EmptyState
				icon={Users}
				title="No agents configured"
				description="Add agent roles to superkick.yaml to launch a task."
				density="compact"
			/>
		)
	}

	const { plan, implement, review } = selection
	const allSelected = plan !== null && implement !== null && review !== null
	const submitError = createLaunchTask.error ? errorMessage(createLaunchTask.error) : null

	function handleSubmit() {
		if (plan === null || implement === null || review === null) return
		createLaunchTask.mutate({
			linear_issue_id: linearIssueIdentifier,
			planner_agent: plan,
			coder_agent: implement,
			reviewer_agent: review
		})
	}

	return (
		<div className="rounded-md border border-edge bg-slate-deep p-4">
			<div className="mb-3 flex items-center justify-between">
				<p className="font-data text-[11px] tracking-wider text-dim uppercase">
					Plan → Implement → Review
				</p>
				<span className="font-data text-[10px] text-dim">{agents.length} agents available</span>
			</div>

			<div className="flex flex-col gap-3">
				{STEPS.map((step) => (
					<div key={step.kind} className="flex flex-col gap-1">
						<label className="font-data flex items-center justify-between text-[11px] text-fog">
							<span className="font-medium">{step.label}</span>
							<span className="text-[10px] text-dim">{step.helper}</span>
						</label>
						<AgentPicker
							value={selection[step.kind]}
							agents={agents}
							onChange={(next) => setSelection((s) => ({ ...s, [step.kind]: next }))}
							recommendedFor={step.kind}
							disabled={createLaunchTask.isPending}
						/>
					</div>
				))}
			</div>

			{submitError ? (
				<div className="mt-3">
					<ErrorState
						title="Could not create launch task"
						message={submitError}
						onRetry={handleSubmit}
						density="compact"
					/>
				</div>
			) : null}

			<div className="mt-4 flex items-center justify-end gap-2">
				<Button
					size="sm"
					disabled={!allSelected || createLaunchTask.isPending}
					onClick={handleSubmit}
					className="font-data text-[11px]"
					aria-label="Launch task"
				>
					<Play size={11} strokeWidth={1.75} className="fill-current" aria-hidden="true" />
					{createLaunchTask.isPending ? 'LAUNCHING…' : 'LAUNCH TASK'}
				</Button>
			</div>
		</div>
	)
}
