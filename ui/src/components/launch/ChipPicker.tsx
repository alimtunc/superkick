import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { SKIconName } from '@/types/icons'
import { Icon } from '@/ui/Icon'

interface ChipPickerProps {
	icon: SKIconName
	label: string
	value: ReactNode
	onClick?: () => void
	disabled?: boolean
	/** Renders a dashed border with no fill. Marks a slot that's pickable but unset. */
	ghost?: boolean
	/** Dim the value (placeholder vs filled). */
	dim?: boolean
	className?: string
}

export function ChipPicker({
	icon,
	label,
	value,
	onClick,
	disabled,
	ghost = false,
	dim = false,
	className
}: ChipPickerProps) {
	const interactive = !!onClick && !disabled
	const Cmp = interactive ? 'button' : 'div'
	return (
		<Cmp
			type={interactive ? 'button' : undefined}
			onClick={interactive ? onClick : undefined}
			disabled={interactive ? disabled : undefined}
			className={cn(
				'inline-flex items-center gap-[7px] rounded-[7px] px-2.5 py-[5px] text-[12.5px] transition-colors',
				'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
				ghost
					? 'border border-dashed border-border bg-transparent'
					: 'border border-transparent bg-raised',
				interactive ? 'hover:border-border-strong' : 'cursor-default',
				disabled ? 'opacity-50' : null,
				className
			)}
		>
			<Icon name={icon} size={13} className={dim ? 'text-fg-dim' : 'text-fg-muted'} />
			<span className="text-fg-dim">{label}</span>
			<span className={cn('font-medium', dim ? 'text-fg-dim' : 'text-fg')}>{value}</span>
			{interactive ? <Icon name="chevDown" size={11} className="text-fg-dim" /> : null}
		</Cmp>
	)
}
