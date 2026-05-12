import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

import { cn } from '@/lib/utils'
import type { SKIconName } from '@/types/icons'

import { Icon } from './Icon'

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'surface'
type BtnSize = 'sm' | 'md'

interface BtnProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
	kind?: BtnKind
	size?: BtnSize
	icon?: SKIconName
	iconRight?: SKIconName
	full?: boolean
	children?: ReactNode
	ref?: Ref<HTMLButtonElement>
}

const KIND: Record<BtnKind, string> = {
	primary: 'bg-accent text-white border-transparent hover:brightness-110',
	secondary: 'bg-raised text-fg border-border hover:border-border-strong',
	ghost: 'bg-transparent text-fg-muted border-transparent hover:text-fg hover:bg-raised',
	danger: 'bg-transparent text-danger border-border hover:bg-danger-soft',
	surface: 'bg-surface text-fg border-border hover:border-border-strong'
}

const SIZE: Record<BtnSize, string> = {
	sm: 'h-[26px] px-[10px] text-[12.5px]',
	md: 'h-8 px-[13px] text-[13.5px]'
}

const ICON_SIZE: Record<BtnSize, number> = {
	sm: 14,
	md: 15
}

export function Btn({
	kind = 'secondary',
	size = 'md',
	icon,
	iconRight,
	full = false,
	children,
	className,
	type = 'button',
	disabled,
	ref,
	...rest
}: BtnProps) {
	return (
		<button
			ref={ref}
			type={type}
			disabled={disabled}
			className={cn(
				'inline-flex items-center gap-[7px] rounded-[7px] border font-medium transition-colors',
				'focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none',
				'disabled:cursor-not-allowed disabled:opacity-50',
				KIND[kind],
				SIZE[size],
				full ? 'w-full justify-center' : 'w-auto justify-start',
				className
			)}
			{...rest}
		>
			{icon ? <Icon name={icon} size={ICON_SIZE[size]} /> : null}
			{children}
			{iconRight ? <Icon name={iconRight} size={ICON_SIZE[size]} /> : null}
		</button>
	)
}
