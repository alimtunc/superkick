import { isBudgetPaused, pauseTitle } from '@/components/run-detail/runStatusBanner.helpers'
import type { Run } from '@/types'
import { Icon } from '@/ui/Icon'
import { Link } from '@tanstack/react-router'

interface NeedsHumanBannerProps {
	run: Run
}

export function NeedsHumanBanner({ run }: NeedsHumanBannerProps) {
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
