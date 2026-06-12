import type { ReactNode } from 'react'

interface SkillEditorFieldProps {
	label: string
	children: ReactNode
}

export function SkillEditorField({ label, children }: SkillEditorFieldProps) {
	return (
		<label className="flex flex-col gap-1">
			<span className="text-[12px] text-fg-dim">{label}</span>
			{children}
		</label>
	)
}
