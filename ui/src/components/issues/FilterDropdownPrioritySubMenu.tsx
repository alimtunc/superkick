import { PriorityIcon } from '@/components/issues/PriorityIcon'

export function FilterDropdownPrioritySubMenu({
	activePriorities,
	onToggle
}: {
	activePriorities: Set<number>
	onToggle: (v: number) => void
}) {
	const priorities = [
		{ value: 1, label: 'Urgent' },
		{ value: 2, label: 'High' },
		{ value: 3, label: 'Medium' },
		{ value: 4, label: 'Low' },
		{ value: 0, label: 'None' }
	]

	return (
		<div className="py-1">
			{priorities.map(({ value, label }) => {
				const isActive = activePriorities.has(value)
				return (
					<button
						key={value}
						type="button"
						onClick={() => onToggle(value)}
						className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-white/5 ${
							isActive ? 'bg-white/3' : ''
						}`}
					>
						<PriorityIcon value={value} />
						<span className="font-data flex-1 text-[12px] text-silver">{label}</span>
					</button>
				)
			})}
		</div>
	)
}
