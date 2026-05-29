import { PopoverPopup } from '@/components/ui/popover-shell'
import type { TeamOption } from '@/types'

import { PopBody, Popline } from './popoverParts'

interface TeamPickerProps {
	teams: TeamOption[]
	currentId: string | null
	onSelect: (next: TeamOption) => void
}

export function TeamPicker({ teams, currentId, onSelect }: TeamPickerProps) {
	return (
		<PopoverPopup popupClassName="w-64 max-h-80 overflow-hidden flex flex-col p-0">
			{teams.length === 0 ? (
				<p
					style={{
						padding: 'var(--space-4) var(--space-5)',
						fontSize: 'var(--text-12)',
						color: 'var(--fg-dim)'
					}}
				>
					No teams available.
				</p>
			) : (
				<PopBody ariaLabel="Team">
					{teams.map((team) => (
						<Popline
							key={team.id}
							selected={team.id === currentId}
							onClick={() => onSelect(team)}
						>
							<span className="font-data text-[11px] text-fg-dim">{team.key}</span>
							<span>{team.name}</span>
						</Popline>
					))}
				</PopBody>
			)}
		</PopoverPopup>
	)
}
