import { shipSummary } from '@/components/run-detail/runStatusBanner.helpers'
import type { PullRequest, Run } from '@/types'
import { Icon } from '@/ui/Icon'

interface CompletedBannerProps {
	run: Run
	pr: PullRequest | null
}

export function CompletedBanner({ run, pr }: CompletedBannerProps) {
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
