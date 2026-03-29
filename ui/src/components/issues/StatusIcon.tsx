import type { LinearStateType } from '@/types'

export function StatusIcon({ stateType, color }: { stateType: LinearStateType; color: string }) {
	const size = 14

	switch (stateType) {
		case 'backlog':
			// Dashed circle
			return (
				<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
					<circle
						cx="8"
						cy="8"
						r="6"
						stroke={color}
						strokeWidth="1.5"
						strokeDasharray="3 2"
						opacity={0.6}
					/>
				</svg>
			)
		case 'unstarted':
			// Empty circle
			return (
				<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
				</svg>
			)
		case 'started':
			// Half-filled circle
			return (
				<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
					<path d="M8 2a6 6 0 0 1 0 12V2Z" fill={color} />
				</svg>
			)
		case 'completed':
			// Filled circle with check
			return (
				<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="8" r="6.5" fill={color} />
					<path
						d="M5.5 8.5L7 10L10.5 6.5"
						stroke="white"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)
		case 'canceled':
			// Circle with X
			return (
				<svg width={size} height={size} viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
					<path d="M6 6l4 4M10 6l-4 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
				</svg>
			)
	}
}
