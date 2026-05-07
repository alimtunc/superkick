import { DuplicateRunError } from '@/api'
import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { LatestRunCard } from '@/components/issue-detail/LatestRunCard'
import { LaunchDialog } from '@/components/launch/LaunchDialog'
import { LaunchTaskActivePanel } from '@/components/launch/LaunchTaskActivePanel'
import { LaunchTaskLauncher } from '@/components/launch/LaunchTaskLauncher'
import { Button } from '@/components/ui/button'
import { Disclosure } from '@/components/ui/disclosure'
import { useConfig } from '@/hooks/useConfig'
import { useCreateRun } from '@/hooks/useCreateRun'
import { useLaunchDialog } from '@/hooks/useLaunchDialog'
import { useLaunchTasksForIssue } from '@/hooks/useLaunchTasksForIssue'
import { isActiveRun, pickLatestRun } from '@/lib/domain'
import type { IssueDetailResponse } from '@/types'
import { Play } from 'lucide-react'

interface IssueLauncherPanelProps {
	issue: IssueDetailResponse
}

/**
 * SUP-117 — primary panel on Issue Detail. Routes between the Launch Task
 * launcher (no active task), the Launch Task active view (task in flight),
 * and a collapsed "Advanced — single run" disclosure that keeps the legacy
 * `LaunchDialog` reachable as an escape hatch.
 */
export function IssueLauncherPanel({ issue }: IssueLauncherPanelProps) {
	const { config } = useConfig()
	const createRun = useCreateRun({ issueId: issue.id })
	const launchProfile = config?.launch_profile
	const dialog = useLaunchDialog({
		defaultInstructions: launchProfile?.default_instructions ?? '',
		defaultUseWorktree: launchProfile?.use_worktree ?? true
	})

	const { activeTask } = useLaunchTasksForIssue(issue.identifier)

	const latest = pickLatestRun(issue.linked_runs)
	const hasActiveRun = isActiveRun(latest)
	const duplicateError = createRun.error instanceof DuplicateRunError ? createRun.error : null
	const canStart = !!config?.repo_slug && !!launchProfile && !hasActiveRun && !createRun.isPending

	function handleLaunchSingleRun() {
		if (!config) return
		createRun.launch({
			config,
			issueId: issue.id,
			issueIdentifier: issue.identifier,
			useWorktree: dialog.useWorktree,
			executionMode: dialog.executionMode,
			operatorInstructions: dialog.instructions || undefined,
			onSuccess: dialog.closeDialog
		})
	}

	return (
		<section className="mb-6">
			<SectionTitle title="LAUNCH TASK" />

			{activeTask ? (
				<LaunchTaskActivePanel task={activeTask} />
			) : (
				<LaunchTaskLauncher issueId={issue.id} linearIssueIdentifier={issue.identifier} />
			)}

			{latest ? (
				<div className="mt-4">
					<LatestRunCard run={latest} />
				</div>
			) : null}

			<div className="mt-4">
				<Disclosure header={() => <span>Advanced — launch a single isolated run</span>}>
					<div className="flex items-center justify-between gap-4">
						<span className="font-data text-[11px] text-dim">
							Skips the Plan → Implement → Review recipe and runs the issue once with the legacy
							launcher. Use only when the recipe does not fit.
						</span>
						<Button
							size="xs"
							disabled={!canStart}
							onClick={dialog.openDialog}
							aria-label="Launch a run for this issue"
						>
							<Play size={11} strokeWidth={1.75} className="fill-current" aria-hidden="true" />
							Launch Run
						</Button>
					</div>
					{createRun.isError && !duplicateError ? (
						<p className="font-data mt-2 text-[10px] text-oxide">{createRun.error.message}</p>
					) : null}
				</Disclosure>
			</div>

			{launchProfile ? (
				<LaunchDialog
					open={dialog.open}
					profile={launchProfile}
					instructions={dialog.instructions}
					useWorktree={dialog.useWorktree}
					executionMode={dialog.executionMode}
					isPending={createRun.isPending}
					onInstructionsChange={dialog.setInstructions}
					onUseWorktreeChange={dialog.setUseWorktree}
					onExecutionModeChange={dialog.setExecutionMode}
					onLaunch={handleLaunchSingleRun}
					onClose={dialog.closeDialog}
				/>
			) : null}
		</section>
	)
}
