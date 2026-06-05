import type { ReactNode } from 'react'

interface SettingsPaneHeaderProps {
	title: string
	description: ReactNode
}

export function SettingsPaneHeader({ title, description }: SettingsPaneHeaderProps) {
	return (
		<>
			<h2 className="mb-1 text-[21px] font-semibold tracking-tight text-fg">{title}</h2>
			<p className="mb-7 text-[13px] text-fg-dim">{description}</p>
		</>
	)
}
