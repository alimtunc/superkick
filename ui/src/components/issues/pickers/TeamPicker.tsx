import { PopoverPopup } from '@/components/ui/popover-shell'
import type { TeamOption } from '@/types'

interface TeamPickerProps {
	teams: TeamOption[]
	currentId: string | null
	onSelect: (next: TeamOption) => void
}

export function TeamPicker({ teams, currentId, onSelect }: TeamPickerProps) {
	return (
		<PopoverPopup popupClassName="w-64 max-h-80 overflow-y-auto p-1">
			{teams.length === 0 ? (
				<p className="px-3 py-2 text-[12px] text-fg-dim">No teams available.</p>
			) : (
				<div role="listbox" aria-label="Team" className="flex flex-col gap-0.5">
					{teams.map((team) => {
						const selected = team.id === currentId
						return (
							<button
								key={team.id}
								type="button"
								role="option"
								aria-selected={selected}
								onClick={() => onSelect(team)}
								className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-fg hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
							>
								<span className="inline-flex items-center gap-2">
									<span className="font-data text-[11px] text-fg-dim">{team.key}</span>
									<span>{team.name}</span>
								</span>
								{selected ? <span className="text-fg-dim">✓</span> : null}
							</button>
						)
					})}
				</div>
			)}
		</PopoverPopup>
	)
}
