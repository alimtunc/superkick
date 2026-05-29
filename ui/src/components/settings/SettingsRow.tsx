import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface SettingsRowProps {
	label: string
	hint?: string
	last?: boolean
	children: ReactNode
}

export function SettingsRow({ label, hint, last, children }: SettingsRowProps) {
	return (
		<div className={cn('flex items-center gap-5 py-3', last ? null : 'border-b border-(--border-faint)')}>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-[13px] text-fg">{label}</span>
				{hint ? <span className="text-[12px] text-fg-dim">{hint}</span> : null}
			</div>
			{children}
		</div>
	)
}
