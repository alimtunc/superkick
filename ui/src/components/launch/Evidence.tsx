import type { ReactNode } from 'react'

import {
	EVIDENCE_ACCENT_BORDER,
	EVIDENCE_ACCENT_TEXT,
	EVIDENCE_KIND_ICON,
	EVIDENCE_KIND_TONE
} from '@/lib/launch/evidence'
import { cn } from '@/lib/utils'
import type { EvidenceKind } from '@/types'
import { Icon } from '@/ui/Icon'

interface EvidenceProps {
	kind: EvidenceKind
	title: ReactNode
	meta?: ReactNode
	badge?: ReactNode
	body?: ReactNode
	muted?: boolean
}

export function Evidence({ kind, title, meta, badge, body, muted = false }: EvidenceProps) {
	const tone = EVIDENCE_KIND_TONE[kind]
	const icon = EVIDENCE_KIND_ICON[kind]
	return (
		<div
			className={cn(
				'mb-4 border-l-2 pl-3.5',
				EVIDENCE_ACCENT_BORDER[tone],
				muted ? 'opacity-70' : null
			)}
		>
			<div className={cn('flex items-center gap-2', body ? 'mb-2' : null)}>
				<Icon name={icon} size={13} className={EVIDENCE_ACCENT_TEXT[tone]} />
				<span className="truncate text-[13px] font-medium text-fg">{title}</span>
				{badge}
				<span className="flex-1" />
				{meta ? <span className="font-mono text-[11px] text-fg-dim">{meta}</span> : null}
			</div>
			{body ? <div className="text-[12.5px] text-fg-muted">{body}</div> : null}
		</div>
	)
}
