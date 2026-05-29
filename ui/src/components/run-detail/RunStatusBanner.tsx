import type { PullRequest, Run } from '@/types'
import { Icon } from '@/ui/Icon'
import { Link } from '@tanstack/react-router'

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
	const success = run.state === 'completed'
	return (
		<div
			role="status"
			className="opbanner"
			style={{
				background: success ? 'var(--success-soft)' : 'var(--warn-soft)',
				borderColor: success ? 'var(--success)' : 'var(--warn)'
			}}
			data-banner-state={run.state}
		>
			<span className="opbanner__icon" style={{ color: success ? 'var(--success)' : 'var(--warn)' }}>
				<Icon name={success ? 'check' : 'alert'} size={18} className="ic" />
			</span>
			<div className="opbanner__body">
				<p className="opbanner__title">{shipSummary(run)}</p>
				{pr ? (
					<div className="opbanner__actions">
						<a href={pr.url} target="_blank" rel="noopener noreferrer" className="btn btn--sm">
							<Icon name="external" size={14} className="ic" />
							View PR #{pr.number}
						</a>
					</div>
				) : null}
			</div>
		</div>
	)
}

function NeedsHumanBanner({ run }: { run: Run }) {
	const title = pauseTitle(run)
	const reason = run.pause_reason ?? null

	return (
		<div role="alert" className="opbanner" data-banner-state="needs-human">
			<span className="opbanner__icon">
				<Icon name={isBudgetPaused(run) ? 'clock' : 'alert'} size={18} className="ic" />
			</span>
			<div className="opbanner__body">
				<p className="opbanner__title">{title}</p>
				{reason ? <p className="opbanner__q">{reason}</p> : null}
				<div className="opbanner__actions">
					<Link
						to="/issues/$issueId"
						params={{ issueId: run.issue_identifier }}
						className="btn btn--sm"
						aria-label={`Open issue ${run.issue_identifier}`}
					>
						Open issue
						<Icon name="arrowRight" size={14} className="ic" />
					</Link>
				</div>
			</div>
		</div>
	)
}

export function RunStatusBanner({ run, pr, isTerminal, needsHuman }: RunStatusBannerProps) {
	if (needsHuman) {
		return (
			<div className="px-6 pt-5">
				<NeedsHumanBanner run={run} />
			</div>
		)
	}

	if (isTerminal && run.state !== 'cancelled') {
		return (
			<div className="px-6 pt-5">
				<CompletedBanner run={run} pr={pr} />
			</div>
		)
	}

	return null
}
