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
		<div className={cn('flex items-start gap-6 py-4', last ? null : 'border-b border-border')}>
			<div className="flex w-[260px] flex-none flex-col gap-[3px]">
				<span className="text-[13.5px] font-medium text-fg">{label}</span>
				{hint ? <span className="text-[12px] leading-[1.5] text-fg-muted">{hint}</span> : null}
			</div>
			<div className="flex-1">{children}</div>
		</div>
	)
}
