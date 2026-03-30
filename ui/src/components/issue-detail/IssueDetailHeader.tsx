import { DuplicateRunError } from '@/api'
import { LaunchDialog } from '@/components/launch/LaunchDialog'
import { Button } from '@/components/ui/button'
import { useConfig } from '@/hooks/useConfig'
import { useCreateRun } from '@/hooks/useCreateRun'
import { useLaunchDialog } from '@/hooks/useLaunchDialog'
import type { IssueDetailResponse } from '@/types'
import { Link } from '@tanstack/react-router'

export function IssueDetailHeader({
	issue,
	onRefresh
}: {
	issue: IssueDetailResponse
	onRefresh: () => void
}) {
	const { config } = useConfig()
	const createRun = useCreateRun({ issueId: issue.id })
	const launchProfile = config?.launch_profile
	const dialog = useLaunchDialog({
		defaultInstructions: launchProfile?.default_instructions ?? ''
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
			operatorInstructions: dialog.instructions || undefined,
			onSuccess: dialog.closeDialog
		})
	}

	const canStart = !!config?.repo_slug && !!launchProfile && !activeRun && !createRun.isPending

	return (
		<header className="sticky top-0 z-50 border-b border-edge bg-carbon/90 backdrop-blur-md">
			<div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5">
				<div className="flex items-center gap-3">
					<Link
						to="/issues"
						className="font-data text-[11px] text-dim transition-colors hover:text-silver"
					>
						&larr; ISSUES
					</Link>
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

					<Button
						variant="outline"
						size="xs"
						onClick={onRefresh}
						className="font-data text-[11px] text-dim hover:text-silver"
					>
						REFRESH
					</Button>

					<a
						href={issue.url}
						target="_blank"
						rel="noopener noreferrer"
						className="font-data inline-flex h-6 items-center rounded-md border border-edge px-2 text-[11px] text-dim transition-colors hover:border-edge-bright hover:text-silver"
					>
						LINEAR
					</a>

					<span className="mx-1 h-5 w-px bg-edge" />

					{activeRunId ? (
						<Link
							to="/runs/$runId"
							params={{ runId: activeRunId }}
							className="font-data inline-flex h-6 items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-[11px] text-amber-400 transition-colors hover:border-amber-500/60 hover:text-amber-300"
						>
							RUN ACTIVE
						</Link>
					) : (
						<Button
							size="xs"
							disabled={!canStart}
							onClick={dialog.openDialog}
							className="font-data text-[11px]"
						>
							START
						</Button>
					)}
				</div>
			</div>

			{launchProfile ? (
				<LaunchDialog
					open={dialog.open}
					profile={launchProfile}
					instructions={dialog.instructions}
					isPending={createRun.isPending}
					onInstructionsChange={dialog.setInstructions}
					onLaunch={handleLaunch}
					onClose={dialog.closeDialog}
				/>
			) : null}
		</header>
	)
}
