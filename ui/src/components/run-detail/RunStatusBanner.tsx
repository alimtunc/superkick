import type { PullRequest, Run } from '@/types'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock } from 'lucide-react'

interface RunStatusBannerProps {
	run: Run
	pr: PullRequest | null
	isTerminal: boolean
	needsHuman: boolean
}

function isApprovalPaused(run: Run): boolean {
	return run.pause_kind === 'approval'
}

function isBudgetPaused(run: Run): boolean {
	return run.pause_kind === 'budget'
}

function shipSummary(run: Run): string {
	if (run.state === 'completed') return 'Run completed successfully.'
	if (run.state === 'failed') return run.error_message ?? 'Run failed.'
	if (run.state === 'cancelled') return 'Run was cancelled.'
	return 'Run finished.'
}

function pauseTitle(run: Run): string {
	if (isBudgetPaused(run)) return 'Budget tripped'
	if (isApprovalPaused(run)) return 'Approval required'
	return 'Needs your decision'
}

function CompletedBanner({ run, pr }: { run: Run; pr: PullRequest | null }) {
	const tone =
		run.state === 'completed'
			? 'border-success bg-success-soft text-success'
			: 'border-warn bg-warn-soft text-warn'
	const Cmp = run.state === 'completed' ? CheckCircle2 : AlertTriangle
	return (
		<div
			role="status"
			className={`flex items-center gap-3 border-b px-6 py-3 ${tone}`}
			data-banner-state={run.state}
		>
			<Cmp size={16} aria-hidden="true" className="shrink-0" />
			<div className="min-w-0 flex-1">
				<div className="text-[13px] font-medium text-fg">{shipSummary(run)}</div>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{pr ? (
					<a
						href={pr.url}
						target="_blank"
						rel="noopener noreferrer"
						className="font-data inline-flex items-center gap-1 rounded-md border border-success/40 px-2.5 py-1 text-[12px] text-success hover:bg-success/10 focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:outline-none"
					>
						View PR #{pr.number}
					</a>
				) : null}
			</div>
		</div>
	)
}

function NeedsHumanBanner({ run }: { run: Run }) {
	const Icon = isBudgetPaused(run) ? Clock : AlertTriangle
	const title = pauseTitle(run)
	const reason = run.pause_reason ?? null

	return (
		<div
			role="alert"
			className="border-b border-warn bg-warn-soft px-6 py-3 text-warn"
			data-banner-state="needs-human"
		>
			<div className="flex items-start gap-3">
				<Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
				<div className="min-w-0 flex-1">
					<div className="text-[13px] font-medium text-fg">{title}</div>
					{reason ? <div className="mt-1 text-[12.5px] text-fg-muted">{reason}</div> : null}
				</div>
				<Link
					to="/issues/$issueId"
					params={{ issueId: run.issue_identifier }}
					className="inline-flex shrink-0 items-center gap-1 rounded-md border border-warn/40 px-2.5 py-1 text-[12px] text-warn hover:bg-warn/10 focus-visible:ring-2 focus-visible:ring-warn/40 focus-visible:outline-none"
					aria-label={`Open issue ${run.issue_identifier}`}
				>
					Open issue
					<ArrowUpRight size={12} strokeWidth={1.85} aria-hidden="true" />
				</Link>
			</div>
		</div>
	)
}

export function RunStatusBanner({ run, pr, isTerminal, needsHuman }: RunStatusBannerProps) {
	if (needsHuman) {
		return <NeedsHumanBanner run={run} />
	}

	if (isTerminal && run.state !== 'cancelled') {
		return <CompletedBanner run={run} pr={pr} />
	}

	return null
}
