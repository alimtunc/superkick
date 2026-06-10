import type { ComponentProps } from 'react'

import { Pill } from '@/components/ui/pill'
import { prStateTone } from '@/lib/domain'
import type { LinkedPrSummary } from '@/types'
import { GitPullRequest } from 'lucide-react'

interface PrBadgeProps {
	pr: LinkedPrSummary
	size?: ComponentProps<typeof Pill>['size']
}

/** Display-only PR tag: a single `#N` pill coloured by PR state, state in the
 *  tooltip. No link, so it nests safely inside row/card anchors; wrap it in an
 *  <a> where a clickable PR link is wanted (rail, completion card). */
export function PrBadge({ pr, size = 'xs' }: PrBadgeProps) {
	return (
		<Pill
			tone={prStateTone[pr.state]}
			size={size}
			mono
			title={`Pull request #${pr.number} · ${pr.state}`}
			leading={<GitPullRequest size={10} aria-hidden="true" />}
		>
			#{pr.number}
		</Pill>
	)
}
