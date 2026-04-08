import { ExecutionModeBadge } from '@/components/ExecutionModeBadge'
import { PrStateBadge } from '@/components/PrStateBadge'
import { RunStateBadge } from '@/components/RunStateBadge'
import { Button } from '@/components/ui/button'
import type { PullRequest, Run } from '@/types'
import { Link } from '@tanstack/react-router'

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
	if (maxReached) return 'border-edge text-dim/30 cursor-not-allowed'
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
					<Link
						to="/"
						className="font-data text-[11px] text-dim transition-colors hover:text-silver"
					>
						&larr; CONTROL CENTER
					</Link>
					<span className="text-edge">|</span>
					<span className="font-data text-[11px] font-medium text-fog">{run.issue_identifier}</span>
					<RunStateBadge state={run.state} />
					{run.execution_mode ? <ExecutionModeBadge mode={run.execution_mode} /> : null}
				</div>

				<div className="flex items-center gap-1.5">
					<Button
						variant="outline"
						size="xs"
						onClick={onToggleWatch}
						disabled={!watched && maxReached}
						className={`font-data text-[11px] ${pinButtonClass(watched, maxReached)}`}
						title={pinButtonTitle(watched, maxReached)}
					>
						{watched ? '\u25C9 PINNED' : '\u25CB PIN'}
					</Button>

					<Button
						variant="outline"
						size="xs"
						onClick={onRefresh}
						className="font-data text-[11px] text-dim hover:text-silver"
					>
						REFRESH
					</Button>

					{pr ? (
						<a
							href={pr.url}
							target="_blank"
							rel="noopener noreferrer"
							className="font-data inline-flex h-6 items-center gap-1.5 rounded-md border border-neon-green/30 bg-neon-green/10 px-2 text-[11px] text-neon-green transition-colors hover:border-neon-green/50 hover:text-neon-green/80"
						>
							#{pr.number}
							<PrStateBadge state={pr.state} />
						</a>
					) : null}

					{!isTerminal ? (
						<>
							<span className="mx-1 h-5 w-px bg-edge" />
							{cancelConfirm ? (
								<div className="flex items-center gap-1">
									<span className="font-data text-[10px] text-oxide">Cancel this run?</span>
									<Button
										variant="destructive"
										size="xs"
										onClick={onCancelConfirm}
										disabled={cancelling}
										className="font-data text-[11px]"
									>
										{cancelling ? '...' : 'CONFIRM'}
									</Button>
									<Button
										variant="ghost"
										size="icon-xs"
										onClick={onCancelDismiss}
										className="font-data text-[11px] text-dim hover:text-silver"
									>
										&times;
									</Button>
								</div>
							) : (
								<Button
									variant="outline"
									size="xs"
									onClick={onCancelRequest}
									className="font-data text-[11px] text-dim hover:border-oxide/30 hover:text-oxide"
								>
									CANCEL RUN
								</Button>
							)}
						</>
					) : null}
				</div>
			</div>
		</header>
	)
}
