import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { AgentPicker } from '@/components/launch/AgentPicker'
import { ChipPicker } from '@/components/launch/ChipPicker'
import { IssueChipPicker } from '@/components/launch/IssueChipPicker'
import { pickDefaultAgent } from '@/components/launch/pickDefaultAgent'
import { SuggestedStarts } from '@/components/launch/SuggestedStarts'
import { ErrorState } from '@/components/ui/state-error'
import { useAgents } from '@/hooks/useAgents'
import { useConfig } from '@/hooks/useConfig'
import { useCreateLaunchTask } from '@/hooks/useCreateLaunchTask'
import { errorMessageOr } from '@/lib/errors'
import { bodyFromIssue, selectionFromDetail, selectionFromListItem } from '@/lib/launch/composerSelection'
import type { IssueChipPickerValue, IssueDetailResponse, LaunchStepKind } from '@/types'
import { Btn } from '@/ui/Btn'
import { Kbd } from '@/ui/Kbd'
import { useNavigate } from '@tanstack/react-router'

interface LaunchComposerProps {
	issue: IssueDetailResponse | null
	prefill?: string | null
}

export function LaunchComposer({ issue, prefill = null }: LaunchComposerProps) {
	const navigate = useNavigate()
	const { config } = useConfig()
	const agentsQuery = useAgents()
	const agentsData = agentsQuery.data
	const agents = agentsData ?? []

	const [selectedIssue, setSelectedIssue] = useState<IssueChipPickerValue | null>(() =>
		selectionFromDetail(issue)
	)
	const [body, setBody] = useState<string>(() => bodyFromIssue(issue) || prefill || '')
	const [selection, setSelection] = useState<Record<LaunchStepKind, string | null>>({
		plan: null,
		implement: null,
		review: null
	})
	const lastSeededIssueIdRef = useRef<string | null>(issue?.id ?? null)
	const lastSeededPrefillRef = useRef<string | null>(prefill)

	useEffect(() => {
		if (!issue) return
		if (issue.id === lastSeededIssueIdRef.current) return
		lastSeededIssueIdRef.current = issue.id
		setSelectedIssue(selectionFromDetail(issue))
		setBody(bodyFromIssue(issue))
	}, [issue])

	useEffect(() => {
		if (issue || !prefill) return
		if (prefill === lastSeededPrefillRef.current) return
		lastSeededPrefillRef.current = prefill
		setBody(prefill)
	}, [issue, prefill])

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

	const createLaunchTask = useCreateLaunchTask({
		issueIdentifier: selectedIssue?.identifier ?? '',
		issueId: selectedIssue?.id,
		onSuccess: (result) => {
			navigate({ to: '/tasks/$taskId', params: { taskId: result.task.id } })
		}
	})

	const planAgent = selection.plan
	const implementAgent = selection.implement
	const reviewAgent = selection.review
	const allAgentsPicked = planAgent !== null && implementAgent !== null && reviewAgent !== null
	const canSubmit =
		selectedIssue !== null &&
		allAgentsPicked &&
		body.trim().length > 0 &&
		!createLaunchTask.isPending &&
		!agentsQuery.isLoading
	const submitError = createLaunchTask.error ? errorMessageOr(createLaunchTask.error) : null

	function handleSubmit() {
		if (!selectedIssue || planAgent === null || implementAgent === null || reviewAgent === null) return
		createLaunchTask.mutate({
			linear_issue_id: selectedIssue.identifier,
			planner_agent: planAgent,
			coder_agent: implementAgent,
			reviewer_agent: reviewAgent
		})
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault()
			if (canSubmit) handleSubmit()
		}
	}

	return (
		<div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-6 py-12">
			<div className="rounded-[14px] border border-border bg-surface p-4.5 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
				<textarea
					aria-label="Launch task instructions"
					value={body}
					onChange={(event) => setBody(event.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Describe what should happen. Reference an issue, share constraints, set the scope."
					className="block min-h-[96px] w-full resize-none bg-transparent text-[15.5px] leading-[1.5] text-fg placeholder:text-fg-dim focus:outline-none"
				/>
				<div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
					<IssueChipPicker
						value={selectedIssue}
						onChange={(item) => {
							setSelectedIssue(selectionFromListItem(item))
							if (body.trim().length === 0) setBody(item.title)
						}}
					/>
					<ChipPicker
						icon="folder"
						label="repo"
						value={config?.repo_slug ?? '—'}
						dim={!config?.repo_slug}
					/>
					<ChipPicker
						icon="branch"
						label="base"
						value={config?.base_branch ?? 'main'}
						dim={!config?.base_branch}
					/>
					<AgentPicker
						value={selection.plan}
						agents={agents}
						onChange={(next) => setSelection((s) => ({ ...s, plan: next }))}
						recommendedFor="plan"
						icon="doc"
						label="planner"
						disabled={agentsQuery.isLoading}
					/>
					<AgentPicker
						value={selection.implement}
						agents={agents}
						onChange={(next) => setSelection((s) => ({ ...s, implement: next }))}
						recommendedFor="implement"
						icon="bot"
						label="coder"
						disabled={agentsQuery.isLoading}
					/>
					<AgentPicker
						value={selection.review}
						agents={agents}
						onChange={(next) => setSelection((s) => ({ ...s, review: next }))}
						recommendedFor="review"
						icon="check"
						label="reviewer"
						disabled={agentsQuery.isLoading}
					/>
					<span className="flex-1" />
					<Btn
						kind="primary"
						size="md"
						iconRight="arrowRight"
						onClick={handleSubmit}
						disabled={!canSubmit}
						aria-label="Launch task"
					>
						{createLaunchTask.isPending ? 'Launching…' : 'Launch'}
					</Btn>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-3 px-1 text-[11.5px] text-fg-dim">
				<span className="inline-flex items-center gap-1">
					<Kbd>⌘</Kbd>
					<span>+</span>
					<Kbd>↵</Kbd>
					<span>launch</span>
				</span>
				<span>Pick an issue, then Plan → Implement → Review.</span>
			</div>

			{submitError ? (
				<ErrorState
					title="Could not create launch task"
					message={submitError}
					onRetry={handleSubmit}
					density="compact"
				/>
			) : null}

			<SuggestedStarts />
		</div>
	)
}
