import { StatusChip } from '@/components/issue-detail/StatusChip'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
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
							className="inline-flex items-center rounded-md text-ash transition-colors hover:text-silver focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
							aria-label="Back"
						>
							<ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
						</button>
					</Tooltip>
					<span className="text-edge" aria-hidden="true">
						|
					</span>
					{issue.parent ? (
						<>
							<Link
								to="/issues/$issueId"
								params={{ issueId: issue.parent.id }}
								className="font-data rounded text-[11px] text-ash transition-colors hover:text-silver focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
							>
								{issue.parent.identifier}
							</Link>
							<span className="font-data text-[10px] text-ash" aria-hidden="true">
								&rsaquo;
							</span>
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
							aria-label="Refresh issue data"
						>
							<RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />
						</Button>
					</Tooltip>

					<Tooltip label="Open in Linear">
						<a
							href={issue.url}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-edge text-ash transition-colors hover:border-edge-bright hover:bg-slate-deep/40 hover:text-silver focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
							aria-label="Open in Linear"
						>
							<ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
						</a>
					</Tooltip>

					{activeRun ? (
						<>
							<span className="mx-1 h-5 w-px bg-edge" aria-hidden="true" />
							<Link
								to="/runs/$runId"
								params={{ runId: activeRun.id }}
								className="inline-flex shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-cyan/40 focus-visible:outline-none"
							>
								<Pill
									tone="cyan"
									size="sm"
									interactive
									leading={
										<span
											className="live-pulse inline-block h-1.5 w-1.5 rounded-full bg-cyan"
											aria-hidden="true"
										/>
									}
								>
									Active run
								</Pill>
							</Link>
						</>
					) : null}
				</div>
			</div>
		</header>
	)
}
