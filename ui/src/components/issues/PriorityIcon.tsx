import { priorityColor } from '@/lib/domain/priorityMeta'

export function PriorityIcon({ value }: { value: number }) {
	const color = priorityColor(value)

	if (value === 1) {
		// Urgent — filled alert icon
		return (
			<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
				<path
					d="M8 1L14.93 13H1.07L8 1Z"
					fill={`${color}25`}
					stroke={color}
					strokeWidth="1.2"
					strokeLinejoin="round"
				/>
				<path d="M8 6v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
				<circle cx="8" cy="11" r="0.75" fill={color} />
			</svg>
		)
	}

	// Bar chart — number of bars based on priority
	const bars = value === 2 ? 3 : value === 3 ? 2 : 1
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
			{bars >= 1 ? <rect x="2" y="10" width="3" height="4" rx="0.5" fill={color} /> : null}
			{bars >= 2 ? (
				<rect x="6.5" y="6" width="3" height="8" rx="0.5" fill={color} />
			) : (
				<rect x="6.5" y="6" width="3" height="8" rx="0.5" fill={`${color}30`} />
			)}
			{bars >= 3 ? (
				<rect x="11" y="2" width="3" height="12" rx="0.5" fill={color} />
			) : (
				<rect x="11" y="2" width="3" height="12" rx="0.5" fill={`${color}30`} />
			)}
		</svg>
	)
}
