import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface SettingsRowProps {
	label: string
	hint?: string
	last?: boolean
	/** Optional element rendered before the label column (e.g. an avatar). */
	leading?: ReactNode
	children: ReactNode
}

export function SettingsRow({ label, hint, last, leading, children }: SettingsRowProps) {
	return (
		<div className={cn('flex items-center gap-5 py-3', last ? null : 'border-b border-(--border-faint)')}>
			<div className="flex min-w-0 flex-1 items-center gap-3">
				{leading ? leading : null}
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="text-[13px] text-fg">{label}</span>
					{hint ? <span className="text-[12px] text-fg-dim">{hint}</span> : null}
				</div>
			</div>
			{children}
		</div>
	)
}
