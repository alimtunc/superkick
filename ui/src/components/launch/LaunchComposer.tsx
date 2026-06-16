import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { BaseBranchChip } from '@/components/launch/BaseBranchChip'
import { ExecutionDestination } from '@/components/launch/ExecutionDestination'
import { IssueChipPicker } from '@/components/launch/IssueChipPicker'
import { LaunchProfileSelector } from '@/components/launch/LaunchProfileSelector'
import { LaunchStepListEditor } from '@/components/launch/LaunchStepListEditor'
import { WorktreeStrategyChip } from '@/components/launch/WorktreeStrategyChip'
import { ErrorState } from '@/components/ui/state-error'
import { useAgents } from '@/hooks/useAgents'
import { useConfig } from '@/hooks/useConfig'
import { useCreateLaunchTask } from '@/hooks/useCreateLaunchTask'
import { useIssueActiveTask } from '@/hooks/useIssueLaunchTasks'
import { useIssueReusableWorktree } from '@/hooks/useIssueReusableWorktree'
import { useLaunchProfiles } from '@/hooks/useLaunchProfiles'
import { errorMessageOr } from '@/lib/errors'
import { bodyFromIssue, selectionFromDetail, selectionFromListItem } from '@/lib/launch/composerSelection'
import { visibleLaunchProfiles } from '@/lib/profiles'
import { useHiddenLaunchProfilesStore } from '@/stores/hiddenLaunchProfiles'
import { useLaunchComposerState } from '@/stores/launchComposerState'
import type {
	IssueChipPickerValue,
	IssueDetailResponse,
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
	const { profiles } = useLaunchProfiles()

	const profileId = useLaunchComposerState((state) => state.profileId)
	const composerSteps = useLaunchComposerState((state) => state.steps)
	const selectProfile = useLaunchComposerState((state) => state.selectProfile)
	const resetComposer = useLaunchComposerState((state) => state.reset)
	const hiddenProfileIds = useHiddenLaunchProfilesStore((state) => state.ids)
	const selectableProfiles = visibleLaunchProfiles(profiles, hiddenProfileIds, profileId)

	const enabledSteps = composerSteps.filter((step) => step.enabled)
	const stepsReady = enabledSteps.length > 0 && enabledSteps.every((step) => Boolean(step.agent_ref))

	const configBase = config?.base_branch?.trim() || DEFAULT_BASE_BRANCH
	const configStrategy: LaunchWorktreeStrategy =
		config?.launch_profile.use_worktree === false ? 'current_checkout' : 'new_worktree'

	const [selectedIssue, setSelectedIssue] = useState<IssueChipPickerValue | null>(() =>
		selectionFromDetail(issue)
	)
	const [body, setBody] = useState<string>(() => bodyFromIssue(issue) || prefill || '')
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

	// Pre-select the default profile once profiles load; the operator can switch
	// via LaunchProfileSelector, which repopulates the editable step list below.
	useEffect(() => {
		if (profileId !== null) return
		const base = profiles.find((profile) => profile.is_default) ?? profiles[0]
		if (base) selectProfile(base)
	}, [profiles, profileId, selectProfile])

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

	const canSubmit =
		selectedIssue !== null &&
		profileId !== null &&
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
		if (!selectedIssue || profileId === null || !stepsReady) return
		const worktree = worktreeFields()
		createLaunchTask.mutate({
			linear_issue_id: selectedIssue.identifier,
			profile_id: profileId,
			step_overrides: composerSteps,
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
				</div>

				{selectableProfiles.length > 1 ? (
					<div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
						<span className="text-[10.5px] font-semibold tracking-wider text-fg-dim uppercase">
							Start from
						</span>
						<div className="flex flex-wrap items-center gap-2">
							<LaunchProfileSelector
								profiles={selectableProfiles}
								selectedId={profileId}
								onSelect={selectProfile}
							/>
							<span className="text-[11.5px] text-fg-dim">
								Preloads the steps below — edit freely after.
							</span>
						</div>
					</div>
				) : null}

				<div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
					<span className="text-[10.5px] font-semibold tracking-wider text-fg-dim uppercase">
						Agents to run
					</span>
					<LaunchStepListEditor />
				</div>

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
				<span>Pick an issue, then add the agents to run in order.</span>
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
		</div>
	)
}
