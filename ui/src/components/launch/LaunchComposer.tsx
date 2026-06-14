import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { AgentPicker } from '@/components/launch/AgentPicker'
import { BaseBranchChip } from '@/components/launch/BaseBranchChip'
import { ExecutionDestination } from '@/components/launch/ExecutionDestination'
import { IssueChipPicker } from '@/components/launch/IssueChipPicker'
import { LaunchProfilePicker } from '@/components/launch/LaunchProfilePicker'
import { LaunchStepListEditor } from '@/components/launch/LaunchStepListEditor'
import { pickDefaultAgent } from '@/components/launch/pickDefaultAgent'
import { SuggestedStarts } from '@/components/launch/SuggestedStarts'
import { WorktreeStrategyChip } from '@/components/launch/WorktreeStrategyChip'
import { ErrorState } from '@/components/ui/state-error'
import { useAgents } from '@/hooks/useAgents'
import { useConfig } from '@/hooks/useConfig'
import { useCreateLaunchTask } from '@/hooks/useCreateLaunchTask'
import { useIssueActiveTask } from '@/hooks/useIssueLaunchTasks'
import { useIssueReusableWorktree } from '@/hooks/useIssueReusableWorktree'
import { useSkills } from '@/hooks/useSkills'
import { errorMessageOr } from '@/lib/errors'
import { bodyFromIssue, selectionFromDetail, selectionFromListItem } from '@/lib/launch/composerSelection'
import { useLaunchComposerState } from '@/stores/launchComposerState'
import type {
	IssueChipPickerValue,
	IssueDetailResponse,
	LaunchStepKind,
	LaunchTaskWithSteps,
	LaunchWorktreeStrategy
} from '@/types'
import { Btn } from '@/ui/Btn'
import { Icon } from '@/ui/Icon'
import { Kbd } from '@/ui/Kbd'
import { useNavigate } from '@tanstack/react-router'

interface LaunchComposerProps {
	issue: IssueDetailResponse | null
	prefill?: string | null
	/** When set, runs instead of the default navigate-to-task-page on a successful launch (e.g. dialog stays on the issue). */
	onLaunched?: (result: LaunchTaskWithSteps) => void
}

const DEFAULT_BASE_BRANCH = 'main'

export function LaunchComposer({ issue, prefill = null, onLaunched }: LaunchComposerProps) {
	const navigate = useNavigate()
	const { config } = useConfig()
	const agentsQuery = useAgents()
	const agentsData = agentsQuery.data
	const agents = agentsData ?? []
	const { skills, isLoading: skillsLoading, error: skillsError } = useSkills()

	const profileId = useLaunchComposerState((state) => state.profileId)
	const composerSteps = useLaunchComposerState((state) => state.steps)
	const resetComposer = useLaunchComposerState((state) => state.reset)
	const profileMode = profileId !== null
	const enabledStepCount = composerSteps.filter((step) => step.enabled).length

	const configBase = config?.base_branch?.trim() || DEFAULT_BASE_BRANCH
	const configStrategy: LaunchWorktreeStrategy =
		config?.launch_profile.use_worktree === false ? 'current_checkout' : 'new_worktree'

	const [selectedIssue, setSelectedIssue] = useState<IssueChipPickerValue | null>(() =>
		selectionFromDetail(issue)
	)
	const [body, setBody] = useState<string>(() => bodyFromIssue(issue) || prefill || '')
	const [selection, setSelection] = useState<Record<LaunchStepKind, string | null>>({
		plan: null,
		implement: null,
		review: null
	})
	const [baseOverride, setBaseOverride] = useState<string | null>(null)
	const [strategyOverride, setStrategyOverride] = useState<LaunchWorktreeStrategy | null>(null)
	const baseBranch = baseOverride ?? configBase
	const strategy = strategyOverride ?? configStrategy
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

	useEffect(() => () => resetComposer(), [resetComposer])

	const createLaunchTask = useCreateLaunchTask({
		issueIdentifier: selectedIssue?.identifier ?? '',
		issueId: selectedIssue?.id,
		onSuccess: (result) => {
			if (onLaunched) {
				onLaunched(result)
				return
			}
			navigate({ to: '/tasks/$taskId', params: { taskId: result.task.id } })
		}
	})

	// Advisory only — launching a second task on an issue is allowed (the API no
	// longer hard-blocks). Surface, don't gate.
	const activeRunTask = useIssueActiveTask(selectedIssue?.identifier ?? '')

	const reusableWorktree = useIssueReusableWorktree(selectedIssue?.identifier ?? '')

	const planAgent = selection.plan
	const implementAgent = selection.implement
	const reviewAgent = selection.review
	const allAgentsPicked = planAgent !== null && implementAgent !== null && reviewAgent !== null
	const stepsReady = profileMode ? enabledStepCount > 0 : allAgentsPicked
	const canSubmit =
		selectedIssue !== null &&
		stepsReady &&
		body.trim().length > 0 &&
		baseBranch.trim().length > 0 &&
		!createLaunchTask.isPending &&
		!agentsQuery.isLoading
	const submitError = createLaunchTask.error ? errorMessageOr(createLaunchTask.error) : null

	function worktreeFields() {
		if (strategy === 'reuse_worktree' && reusableWorktree) {
			return {
				use_worktree: true,
				reuse_worktree_path: reusableWorktree.worktreePath,
				reuse_worktree_branch: reusableWorktree.branchName
			}
		}
		// Reuse picked but the detect query raced to `null` — fall back to a fresh worktree.
		if (strategy === 'current_checkout') return { use_worktree: false }
		return { use_worktree: true }
	}

	function handleSubmit() {
		if (!selectedIssue) return
		const worktree = worktreeFields()
		if (profileMode && profileId !== null) {
			if (enabledStepCount === 0) return
			createLaunchTask.mutate({
				linear_issue_id: selectedIssue.identifier,
				profile_id: profileId,
				step_overrides: composerSteps,
				base_branch: baseBranch.trim(),
				...worktree
			})
			return
		}
		if (planAgent === null || implementAgent === null || reviewAgent === null) return
		createLaunchTask.mutate({
			linear_issue_id: selectedIssue.identifier,
			planner_agent: planAgent,
			coder_agent: implementAgent,
			reviewer_agent: reviewAgent,
			base_branch: baseBranch.trim(),
			...worktree
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
			{createLaunchTask.isPending && selectedIssue ? (
				<div className="toast toast--accent">
					<span className="toast__icon">
						<Icon name="zap" size={18} className="ic" />
					</span>
					<div className="toast__body">
						<div className="toast__title">Launching on {selectedIssue.identifier}…</div>
						<div className="toast__sub">
							{strategy === 'new_worktree' ? 'Preparing worktree' : 'Starting run'}
						</div>
					</div>
				</div>
			) : null}

			<div className="rounded-[14px] border border-border bg-raised p-4.5 shadow-sm">
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
					<LaunchProfilePicker />
					{profileMode ? null : (
						<>
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
						</>
					)}
				</div>

				{profileMode ? (
					<div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
						{skillsError ? (
							<ErrorState
								title="Could not load skills"
								message={skillsError}
								density="compact"
							/>
						) : null}
						<LaunchStepListEditor skills={skills} skillsLoading={skillsLoading} />
					</div>
				) : null}

				<div className="mt-3 flex flex-col gap-2.5 border-t border-border pt-3">
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-[10.5px] font-semibold tracking-wider text-fg-dim uppercase">
							Execution target
						</span>
						<BaseBranchChip
							value={baseBranch}
							configDefault={configBase}
							onChange={setBaseOverride}
						/>
						<WorktreeStrategyChip
							value={strategy}
							onChange={setStrategyOverride}
							reusable={reusableWorktree}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<ExecutionDestination
							repoSlug={config?.repo_slug ?? null}
							baseBranch={baseBranch}
							strategy={strategy}
							reuseBranch={reusableWorktree?.branchName ?? null}
						/>
						<span className="flex-1" />
						<Btn
							kind="primary"
							size="md"
							icon="play"
							onClick={handleSubmit}
							disabled={!canSubmit}
							aria-label="Launch task"
						>
							{createLaunchTask.isPending ? 'Launching…' : 'Launch'}
						</Btn>
					</div>
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

			{activeRunTask && !createLaunchTask.isPending ? (
				<div className="toast toast--accent">
					<span className="toast__icon">
						<Icon name="alert" size={18} className="ic" />
					</span>
					<div className="toast__body">
						<div className="toast__title">
							{selectedIssue?.identifier} already has an active task ({activeRunTask.status})
						</div>
						<div className="toast__sub">
							You can still launch another — each task gets its own branch and worktree.
						</div>
					</div>
				</div>
			) : null}

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
