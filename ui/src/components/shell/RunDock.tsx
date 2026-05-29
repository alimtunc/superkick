import { RunStateBadge } from '@/components/RunStateBadge'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/useNow'
import { fmtElapsed, stepLabel } from '@/lib/domain'
import { runsQuery } from '@/lib/queries'
import { useWatchedSessionsStore } from '@/stores/watchedSessions'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { TerminalSquare, X } from 'lucide-react'

export function RunDock() {
	const focusedId = useWatchedSessionsStore((s) => s.focusedId)
	const clearFocus = useWatchedSessionsStore((s) => s.clearFocus)
	const { data: runs = [] } = useQuery({ ...runsQuery(), enabled: !!focusedId })
	const refTime = useNow()

	if (!focusedId) return null

	const run = runs.find((r) => r.id === focusedId)
	if (!run) return null
	const step = run.current_step_key
		? (stepLabel[run.current_step_key] ?? run.current_step_key)
		: run.state.replace(/_/g, ' ')

	return (
		<div className="shrink-0 border-t border-border bg-surface/90 backdrop-blur-md">
			<div className="mx-auto flex max-w-360 items-center gap-3 px-5 py-2">
				<span className="font-data shrink-0 text-[9px] tracking-widest text-fg-dim uppercase">
					Focused
				</span>
				<Link
					to="/runs/$runId"
					params={{ runId: run.id }}
					className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-md focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
				>
					<span className="font-data shrink-0 text-[12px] font-medium text-fg hover:text-success">
						{run.issue_identifier}
					</span>
					<RunStateBadge state={run.state} />
					<span className="font-data truncate text-[11px] text-fg-muted">{step}</span>
					<span className="font-data shrink-0 text-[10px] text-fg-dim">
						{fmtElapsed(run.started_at, refTime)}
					</span>
					{run.branch_name ? (
						<span className="font-data hidden shrink-0 text-[10px] text-fg-dim md:inline">
							{run.branch_name}
						</span>
					) : null}
				</Link>
				<div className="flex shrink-0 items-center gap-1">
					<Link
						to="/runs/$runId"
						params={{ runId: run.id }}
						hash="terminal"
						className="font-data flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:bg-raised/60 hover:text-fg focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
						title="Open terminal takeover"
					>
						<TerminalSquare size={12} strokeWidth={1.75} aria-hidden="true" />
						<span>Terminal</span>
					</Link>
					<Link
						to="/runs/$runId"
						params={{ runId: run.id }}
						className="font-data flex h-7 items-center rounded-md border border-border bg-surface px-2 text-[11px] text-fg-muted transition-colors hover:border-border-strong hover:bg-raised/60 hover:text-fg focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
					>
						Detail
					</Link>
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={clearFocus}
						className="text-fg-dim hover:text-fg-muted"
						title="Unfocus"
						aria-label="Unfocus"
					>
						<X size={12} strokeWidth={1.75} aria-hidden="true" />
					</Button>
				</div>
			</div>
		</div>
	)
}
