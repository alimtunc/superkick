import { shipSummary } from '@/components/run-detail/runStatusBanner.helpers'
import { ExternalLink } from '@/components/ui/external-link'
import type { PullRequest, Run } from '@/types'
import type { SKIconName } from '@/types/icons'
import { Icon } from '@/ui/Icon'

interface CompletedBannerProps {
	run: Run
	pr: PullRequest | null
}

interface BannerTone {
	background: string
	border: string
	accent: string
	icon: SKIconName
}

function bannerTone(run: Run): BannerTone {
	if (run.state === 'completed') {
		return {
			background: 'var(--success-soft)',
			border: 'var(--success)',
			accent: 'var(--success)',
			icon: 'check'
		}
	}
	if (run.state === 'cancelled') {
		return {
			background: 'var(--bg-active)',
			border: 'var(--border)',
			accent: 'var(--fg-muted)',
			icon: 'x'
		}
	}
	return { background: 'var(--warn-soft)', border: 'var(--warn)', accent: 'var(--warn)', icon: 'alert' }
}

export function CompletedBanner({ run, pr }: CompletedBannerProps) {
	const tone = bannerTone(run)
	return (
		<div
			role="status"
			className="opbanner"
			style={{ background: tone.background, borderColor: tone.border }}
			data-banner-state={run.state}
		>
			<span className="opbanner__icon" style={{ color: tone.accent }}>
				<Icon name={tone.icon} size={18} className="ic" />
			</span>
			<div className="opbanner__body">
				<p className="opbanner__title">{shipSummary(run)}</p>
				{pr ? (
					<div className="opbanner__actions">
						<ExternalLink href={pr.url} className="btn btn--sm">
							<Icon name="external" size={14} className="ic" />
							View PR #{pr.number}
						</ExternalLink>
					</div>
				) : null}
			</div>
		</div>
	)
}
