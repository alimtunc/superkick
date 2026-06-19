import type { ReactNode } from 'react'

interface SettingsSectionProps {
	title: string
	children: ReactNode
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
	return (
		<div className="mb-9">
			<div className="section-head mt-0">
				<span className="section-head__title">{title}</span>
				<span className="section-head__line" />
			</div>
			<div className="rounded-[7px] border border-border bg-raised px-4 shadow-(--shadow-sm)">
				{children}
			</div>
		</div>
	)
}
