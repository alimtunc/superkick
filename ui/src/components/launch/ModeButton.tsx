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
					? 'border-success/50 bg-success-soft text-fg-muted'
					: 'border-border bg-surface text-fg-dim hover:border-border-strong hover:text-fg-muted'
			}`}
		>
			<span className="font-data block text-[11px] font-medium">{label}</span>
			<span className="font-data block text-[10px] text-fg-dim">{description}</span>
		</button>
	)
}
