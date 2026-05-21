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
			className={cn(
				'relative flex min-h-[32px] w-full items-center gap-2.5 px-4 py-[7px] text-left transition-colors',
				'focus-visible:outline-none',
				selected ? 'bg-raised' : 'hover:bg-raised/40'
			)}
		>
			{selected ? (
				<span
					aria-hidden="true"
					className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-r-[2px] bg-accent"
				/>
			) : null}
			{leading ? <span className="flex shrink-0 items-center gap-1">{leading}</span> : null}
			<span className="flex min-w-0 flex-1 flex-col gap-px">
				<span className="truncate text-[13px] text-fg">{primary}</span>
				{secondary ? <span className="truncate text-[11.5px] text-fg-dim">{secondary}</span> : null}
			</span>
			{trailing ? <span className="flex shrink-0 items-center gap-1.5">{trailing}</span> : null}
		</button>
	)
}
