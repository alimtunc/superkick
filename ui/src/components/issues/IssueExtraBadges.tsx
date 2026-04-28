import type { ReactNode } from 'react'

import { Pill } from '@/components/ui/pill'
import type { LaunchQueueItem } from '@/types'
import { CircleSlash, Gauge, Rocket } from 'lucide-react'

interface IssueExtraBadgesProps {
	item: LaunchQueueItem | undefined
	dispatchPosition?: number | undefined
}

/**
 * Contextual badges that surface gating signals the 6-column kanban
 * intentionally folds away (`waiting` / `blocked` / `launchable`). Run-side
 * attention badges live in `LaunchRunBadges` and are not duplicated here.
 */
export function IssueExtraBadges({ item, dispatchPosition }: IssueExtraBadgesProps) {
	if (!item) return null

	const badges: { key: string; element: ReactNode }[] = []

	if (item.bucket === 'launchable') {
		badges.push({
			key: 'launchable',
			element: (
				<Pill
					tone="live"
					size="xs"
					title="Ready to dispatch"
					leading={<Rocket size={10} aria-hidden="true" />}
				>
					{dispatchPosition !== undefined ? `Ready · #${dispatchPosition}` : 'Ready'}
				</Pill>
			)
		})
	}

	if (item.bucket === 'waiting') {
		badges.push({
			key: 'waiting',
			element: (
				<Pill
					tone="gold"
					size="xs"
					title={item.reason}
					leading={<Gauge size={10} aria-hidden="true" />}
				>
					Waiting
				</Pill>
			)
		})
	}

	if (item.bucket === 'blocked') {
		const blockerCount =
			item.kind === 'issue'
				? item.issue.blocked_by.filter(
						(b) => b.status.state_type !== 'completed' && b.status.state_type !== 'canceled'
					).length
				: 0
		const label = blockerCount > 0 ? `Blocked · ${blockerCount}` : 'Blocked'
		badges.push({
			key: 'blocked',
			element: (
				<Pill
					tone="oxide"
					size="xs"
					title={item.reason}
					leading={<CircleSlash size={10} aria-hidden="true" />}
				>
					{label}
				</Pill>
			)
		})
	}

	if (badges.length === 0) return null

	return (
		<div className="flex shrink-0 items-center gap-1">
			{badges.map((b) => (
				<span key={b.key}>{b.element}</span>
			))}
		</div>
	)
}
