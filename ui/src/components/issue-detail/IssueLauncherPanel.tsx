import { DuplicateRunError } from '@/api'
import { SectionTitle } from '@/components/dashboard/SectionTitle'
import { LatestRunCard } from '@/components/issue-detail/LatestRunCard'
import { LaunchDialog } from '@/components/launch/LaunchDialog'
import { Button } from '@/components/ui/button'
import { useConfig } from '@/hooks/useConfig'
import { useCreateRun } from '@/hooks/useCreateRun'
import { useLaunchDialog } from '@/hooks/useLaunchDialog'
import { isActiveRun, pickLatestRun } from '@/lib/domain'
import type { IssueDetailResponse } from '@/types'
import { Play } from 'lucide-react'

interface IssueLauncherPanelProps {
	issue: IssueDetailResponse
}

export function IssueLauncherPanel({ issue }: IssueLauncherPanelProps) {
	const { config } = useConfig()
	const createRun = useCreateRun({ issueId: issue.id })
	const launchProfile = config?.launch_profile
	const dialog = useLaunchDialog({
		defaultInstructions: launchProfile?.default_instructions ?? '',
		defaultUseWorktree: launchProfile?.use_worktree ?? true
	})

	const latest = pickLatestRun(issue.linked_runs)
	const hasActiveRun = isActiveRun(latest)
	const duplicateError = createRun.error instanceof DuplicateRunError ? createRun.error : null
	const canStart = !!config?.repo_slug && !!launchProfile && !hasActiveRun && !createRun.isPending

	function handleLaunch() {
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
			<SectionTitle title="RUN" />
			{latest ? <LatestRunCard run={latest} /> : null}
			{!hasActiveRun ? (
				<div className="flex items-center justify-between gap-4 rounded-md border border-edge bg-slate-deep px-4 py-3">
					<span className="font-data text-[12px] text-silver">
						{latest ? 'Start another run' : 'No run yet'}
					</span>
					<Button
						size="xs"
						disabled={!canStart}
						onClick={dialog.openDialog}
						aria-label="Launch a run for this issue"
					>
						<Play size={11} strokeWidth={1.75} className="fill-current" aria-hidden="true" />
						Launch
					</Button>
				</div>
			) : null}
			{createRun.isError && !duplicateError ? (
				<p className="font-data mt-2 text-[10px] text-oxide">{createRun.error.message}</p>
			) : null}

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
					onLaunch={handleLaunch}
					onClose={dialog.closeDialog}
				/>
			) : null}
		</section>
	)
}
