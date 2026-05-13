import { Btn } from '@/ui/Btn'

type IssuesViewMode = 'list' | 'kanban'

interface IssuesViewToggleProps {
	value: IssuesViewMode
	onChange: (next: IssuesViewMode) => void
}

export function IssuesViewToggle({ value, onChange }: IssuesViewToggleProps) {
	const next: IssuesViewMode = value === 'list' ? 'kanban' : 'list'
	const label = next === 'kanban' ? 'Kanban' : 'List'

	return (
		<Btn
			kind="ghost"
			size="sm"
			icon="layers"
			onClick={() => onChange(next)}
			aria-label={`Switch to ${label} view`}
		>
			{label}
		</Btn>
	)
}
