import { DuplicateRunError } from '@/api'
import { LaunchDialog } from '@/components/launch/LaunchDialog'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useConfig } from '@/hooks/useConfig'
import { useCreateRun } from '@/hooks/useCreateRun'
import { useLaunchDialog } from '@/hooks/useLaunchDialog'
import type { IssueDetailResponse } from '@/types'
import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink, Play, RefreshCw } from 'lucide-react'

export function IssueDetailHeader({
	issue,
	onRefresh
}: {
	issue: IssueDetailResponse
	onRefresh: () => void
}) {
	const { config } = useConfig()
	const router = useRouter()
	const createRun = useCreateRun({ issueId: issue.id })
	const launchProfile = config?.launch_profile
	const dialog = useLaunchDialog({
		defaultInstructions: launchProfile?.default_instructions ?? '',
		defaultUseWorktree: launchProfile?.use_worktree ?? true
	})

	const activeRun = issue.linked_runs.find((r) => !['completed', 'failed', 'cancelled'].includes(r.state))

	const duplicateError = createRun.error instanceof DuplicateRunError ? createRun.error : null

	const activeRunId = activeRun?.id ?? duplicateError?.activeRunId

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

	const canStart = !!config?.repo_slug && !!launchProfile && !activeRun && !createRun.isPending

	return (
		<header className="sticky top-0 z-50 border-b border-edge bg-carbon/90 backdrop-blur-md">
			<div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5">
				<div className="flex items-center gap-3">
					<Tooltip label="Back">
						<button
							type="button"
							onClick={() => router.history.back()}
							className="inline-flex items-center text-dim transition-colors hover:text-silver"
							aria-label="Back"
						>
							<ArrowLeft size={14} />
						</button>
					</Tooltip>
					<span className="text-edge">|</span>
					{issue.parent ? (
						<>
							<Link
								to="/issues/$issueId"
								params={{ issueId: issue.parent.id }}
								className="font-data text-[11px] text-dim transition-colors hover:text-silver"
							>
								{issue.parent.identifier}
							</Link>
							<span className="font-data text-[10px] text-dim">&rsaquo;</span>
						</>
					) : null}
					<span className="font-data text-[11px] font-medium text-fog">{issue.identifier}</span>
					<span
						className="inline-block rounded px-2 py-0.5 text-[10px] font-medium"
						style={{
							color: issue.status.color,
							backgroundColor: `${issue.status.color}15`
						}}
					>
						{issue.status.name}
					</span>
				</div>

				<div className="flex items-center gap-1.5">
					{createRun.isError && !duplicateError ? (
						<span className="font-data text-[10px] text-oxide">{createRun.error.message}</span>
					) : null}

					<Tooltip label="Refresh issue data">
						<Button
							variant="outline"
							size="icon-xs"
							onClick={onRefresh}
							className="text-dim hover:text-silver"
							aria-label="Refresh issue data"
						>
							<RefreshCw size={13} />
						</Button>
					</Tooltip>

					<Tooltip label="Open in Linear">
						<a
							href={issue.url}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-edge text-dim transition-colors hover:border-edge-bright hover:text-silver"
							aria-label="Open in Linear"
						>
							<ExternalLink size={13} />
						</a>
					</Tooltip>

					<span className="mx-1 h-5 w-px bg-edge" />

					{activeRunId ? (
						<Link
							to="/runs/$runId"
							params={{ runId: activeRunId }}
							className="font-data inline-flex h-6 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-[11px] text-amber-400 transition-colors hover:border-amber-500/60 hover:text-amber-300"
						>
							<span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
							Active run
						</Link>
					) : (
						<Tooltip label="Start a new run">
							<Button
								size="icon-xs"
								disabled={!canStart}
								onClick={dialog.openDialog}
								aria-label="Start a new run"
							>
								<Play size={12} className="fill-white text-white" />
							</Button>
						</Tooltip>
					)}
				</div>
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
					onLaunch={handleLaunch}
					onClose={dialog.closeDialog}
				/>
			) : null}
		</header>
	)
}
