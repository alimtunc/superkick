import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

import { cn } from '@/lib/utils'
import type { SKIconName } from '@/types/icons'

import { Icon } from './Icon'

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'surface'
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

const KIND_CLASS: Record<BtnKind, string> = {
	primary: 'btn--primary',
	secondary: '',
	surface: '',
	ghost: 'btn--ghost',
	danger: 'btn--danger',
	success: 'btn--success'
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
	const iconOnly = children == null && (icon != null || iconRight != null)

	if (iconOnly) {
		return (
			<button ref={ref} type={type} disabled={disabled} className={cn('iconbtn', className)} {...rest}>
				<Icon name={(icon ?? iconRight)!} size={16} className="ic" />
			</button>
		)
	}

	return (
		<button
			ref={ref}
			type={type}
			disabled={disabled}
			className={cn(
				'btn',
				KIND_CLASS[kind],
				size === 'sm' && 'btn--sm',
				full && 'w-full justify-center',
				'disabled:cursor-not-allowed disabled:opacity-50',
				className
			)}
			{...rest}
		>
			{icon ? <Icon name={icon} size={14} className="ic" /> : null}
			{children}
			{iconRight ? <Icon name={iconRight} size={14} className="ic" /> : null}
		</button>
	)
}
