import type { ReactNode, Ref } from 'react'

import { cn } from '@/lib/utils'

interface ResultRowShellProps {
	selected: boolean
	onSelect: () => void
	onActivate: () => void
	leading?: ReactNode
	primary: ReactNode
	secondary?: ReactNode
	trailing?: ReactNode
	ref?: Ref<HTMLButtonElement>
}

export function ResultRowShell({
	selected,
	onSelect,
	onActivate,
	leading,
	primary,
	secondary,
	trailing,
	ref
}: ResultRowShellProps) {
	return (
		<button
			ref={ref}
			type="button"
			role="option"
			aria-selected={selected}
			onMouseEnter={onSelect}
			onClick={onActivate}
			style={selected ? { background: 'var(--bg-active)' } : undefined}
			className={cn(
				'popline flex min-h-8 w-full items-center gap-2 rounded-[5px] px-2 py-2 text-left',
				'focus-visible:outline-none'
			)}
		>
			{leading ? <span className="flex shrink-0 items-center gap-1.5">{leading}</span> : null}
			<span className="flex min-w-0 flex-1 flex-col gap-px">
				<span className="truncate text-[13px] text-fg">{primary}</span>
				{secondary ? <span className="truncate text-[11.5px] text-fg-dim">{secondary}</span> : null}
			</span>
			{trailing ? <span className="flex shrink-0 items-center gap-1.5">{trailing}</span> : null}
		</button>
	)
}
