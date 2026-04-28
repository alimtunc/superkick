import { StatusChip } from '@/components/issue-detail/StatusChip'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { isActiveRun } from '@/lib/domain'
import type { IssueDetailResponse } from '@/types'
import { Link, useRouter } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'

export function IssueDetailHeader({
	issue,
	onRefresh
}: {
	issue: IssueDetailResponse
	onRefresh: () => void
}) {
	const router = useRouter()
	const activeRun = issue.linked_runs.find(isActiveRun)

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
					<StatusChip status={issue.status} />
				</div>

				<div className="flex items-center gap-1.5">
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

					{activeRun ? (
						<>
							<span className="mx-1 h-5 w-px bg-edge" />
							<Link
								to="/runs/$runId"
								params={{ runId: activeRun.id }}
								className="font-data inline-flex h-6 items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 text-[11px] text-amber-400 transition-colors hover:border-amber-500/60 hover:text-amber-300"
							>
								<span className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
								Active run
							</Link>
						</>
					) : null}
				</div>
			</div>
		</header>
	)
}
