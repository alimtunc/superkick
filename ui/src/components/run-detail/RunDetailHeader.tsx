import { ExecutionModeBadge } from '@/components/ExecutionModeBadge'
import { PrStateBadge } from '@/components/PrStateBadge'
import { RunStateBadge } from '@/components/RunStateBadge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Pill } from '@/components/ui/pill'
import { Tooltip } from '@/components/ui/tooltip'
import type { PullRequest, Run } from '@/types'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Pin, RefreshCw, Square } from 'lucide-react'

interface RunDetailHeaderProps {
	run: Run
	pr: PullRequest | null
	isTerminal: boolean
	onRefresh: () => void
	watched: boolean
	maxReached: boolean
	onToggleWatch: () => void
	cancelConfirm: boolean
	onCancelRequest: () => void
	onCancelConfirm: () => void
	onCancelDismiss: () => void
	cancelling: boolean
}

function pinButtonClass(watched: boolean, maxReached: boolean): string {
	if (watched) return 'border-mineral/30 bg-mineral-dim text-mineral hover:bg-mineral/20'
	if (maxReached) return 'border-edge text-dim cursor-not-allowed'
	return ''
}

function pinButtonTitle(watched: boolean, maxReached: boolean): string {
	if (watched) return 'Remove from watch rail'
	if (maxReached) return 'Max 5 watched'
	return 'Pin to watch rail'
}

export function RunDetailHeader({
	run,
	pr,
	isTerminal,
	onRefresh,
	watched,
	maxReached,
	onToggleWatch,
	cancelConfirm,
	onCancelRequest,
	onCancelConfirm,
	onCancelDismiss,
	cancelling
}: RunDetailHeaderProps) {
	return (
		<header className="sticky top-0 z-50 border-b border-edge bg-carbon/90 backdrop-blur-md">
			<div className="mx-auto flex h-12 max-w-4xl items-center justify-between px-5">
				<div className="flex items-center gap-3">
					<Tooltip label="Back to control center">
						<Link
							to="/"
							className="inline-flex items-center rounded-md text-ash transition-colors hover:text-silver focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
							aria-label="Back to control center"
						>
							<ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
						</Link>
					</Tooltip>
					<span className="text-edge" aria-hidden="true">
						|
					</span>
					<span className="font-data text-[11px] font-medium text-fog">{run.issue_identifier}</span>
					<RunStateBadge state={run.state} />
					{run.execution_mode ? <ExecutionModeBadge mode={run.execution_mode} /> : null}
				</div>

				<div className="flex items-center gap-1.5">
					<Tooltip label={pinButtonTitle(watched, maxReached)}>
						<Button
							variant="outline"
							size="icon-xs"
							onClick={onToggleWatch}
							disabled={!watched && maxReached}
							className={pinButtonClass(watched, maxReached)}
							aria-label={pinButtonTitle(watched, maxReached)}
							aria-pressed={watched}
						>
							<Pin size={13} className={watched ? 'fill-current' : undefined} />
						</Button>
					</Tooltip>

					<Tooltip label="Refresh run data">
						<Button
							variant="outline"
							size="icon-xs"
							onClick={onRefresh}
							aria-label="Refresh run data"
						>
							<RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />
						</Button>
					</Tooltip>

					{pr ? (
						<a
							href={pr.url}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-neon-green/40 focus-visible:outline-none"
						>
							<Pill tone="live" size="sm" interactive>
								#{pr.number}
								<PrStateBadge state={pr.state} />
							</Pill>
						</a>
					) : null}

					{!isTerminal ? (
						<>
							<span className="mx-1 h-5 w-px bg-edge" aria-hidden="true" />
							<Tooltip label="Cancel run">
								<Button
									variant="outline"
									size="icon-xs"
									onClick={onCancelRequest}
									className="text-ash hover:border-oxide/30 hover:bg-oxide-dim hover:text-oxide"
									aria-label="Cancel run"
								>
									<Square
										size={12}
										strokeWidth={1.75}
										className="fill-current"
										aria-hidden="true"
									/>
								</Button>
							</Tooltip>
						</>
					) : null}
				</div>
			</div>

			<ConfirmDialog
				open={cancelConfirm}
				onOpenChange={(open) => {
					if (!open) onCancelDismiss()
				}}
				title="Cancel this run?"
				description={
					<>
						<span className="font-data text-fog">{run.issue_identifier}</span> will be stopped.
						In-flight agent work is discarded, but the worktree and any committed changes are
						preserved.
					</>
				}
				confirmLabel="Cancel run"
				cancelLabel="Keep running"
				destructive
				busy={cancelling}
				onConfirm={onCancelConfirm}
			/>
		</header>
	)
}
