import type { ExecutionMode } from '@/types'

interface ModeButtonProps {
	mode: ExecutionMode
	label: string
	description: string
	selected: boolean
	onSelect: (m: ExecutionMode) => void
}

export function ModeButton({ mode, label, description, selected, onSelect }: ModeButtonProps) {
	return (
		<button
			type="button"
			onClick={() => onSelect(mode)}
			className={`flex-1 rounded border px-3 py-2 text-left transition-colors ${
				selected
					? 'border-mineral/50 bg-mineral-dim text-silver'
					: 'border-edge bg-carbon text-dim hover:border-edge-bright hover:text-silver'
			}`}
		>
			<span className="font-data block text-[11px] font-medium">{label}</span>
			<span className="font-data block text-[10px] text-dim">{description}</span>
		</button>
	)
}
