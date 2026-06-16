import type { ReactNode } from 'react'

import { Switch } from '@/components/primitives/switch'

interface ToggleProps {
	checked: boolean
	ariaLabel: string
	onChange?: (checked: boolean) => void
	label?: ReactNode
	disabled?: boolean
}

export function Toggle({ checked, ariaLabel, onChange, label, disabled = false }: ToggleProps) {
	const control = (
		<Switch
			checked={checked}
			disabled={disabled}
			aria-label={ariaLabel}
			onCheckedChange={(next) => onChange?.(next)}
		/>
	)

	if (!label) return control

	return (
		<span className="toggle">
			{control}
			<span className="toggle__label">{label}</span>
		</span>
	)
}
