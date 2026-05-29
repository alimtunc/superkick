import type { KeyboardEvent, ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ToggleProps {
	checked: boolean
	ariaLabel: string
	onChange?: (checked: boolean) => void
	label?: ReactNode
	disabled?: boolean
}

export function Toggle({ checked, ariaLabel, onChange, label, disabled = false }: ToggleProps) {
	const interactive = !disabled
	const toggle = () => onChange?.(!checked)
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault()
			toggle()
		}
	}

	return (
		<div
			className={cn('toggle', checked ? 'toggle--on' : null)}
			role="switch"
			aria-checked={checked}
			aria-label={ariaLabel}
			aria-disabled={disabled || undefined}
			tabIndex={interactive ? 0 : undefined}
			onClick={interactive ? toggle : undefined}
			onKeyDown={interactive ? onKeyDown : undefined}
		>
			<span className="toggle__track" />
			{label ? <span className="toggle__label">{label}</span> : null}
		</div>
	)
}
