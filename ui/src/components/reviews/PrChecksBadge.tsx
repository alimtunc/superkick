import { Pill } from '@/components/ui/pill'
import type { PrChecksState, PrChecksSummary } from '@/types'
import type { PillTone } from '@/types/ui'
import { Check, Loader, X, type LucideIcon } from 'lucide-react'

import { checksLabel } from './reviewStatus'

interface PrChecksBadgeProps {
	checks: PrChecksSummary
	size?: 'xs' | 'sm'
}

const VIEW: Record<PrChecksState, { tone: PillTone; icon: LucideIcon }> = {
	passing: { tone: 'success', icon: Check },
	failing: { tone: 'danger', icon: X },
	pending: { tone: 'warn', icon: Loader }
}

export function PrChecksBadge({ checks, size = 'xs' }: PrChecksBadgeProps) {
	const view = VIEW[checks.state]
	const Glyph = view.icon
	return (
		<Pill
			tone={view.tone}
			size={size}
			leading={<Glyph size={11} strokeWidth={2.25} aria-hidden="true" />}
		>
			{checksLabel(checks)}
		</Pill>
	)
}
