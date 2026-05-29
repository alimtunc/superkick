import { PopoverPopup } from '@/components/ui/popover-shell'
import type { WorkflowStateOption } from '@/types'
import { StatusIcon, statusIconKindFor } from '@/ui'

import { PopBody, PopFooter, Popline } from './popoverParts'

interface StatusPickerProps {
	states: WorkflowStateOption[]
	currentId: string | null
	onSelect: (next: WorkflowStateOption) => void
}

export function StatusPicker({ states, currentId, onSelect }: StatusPickerProps) {
	return (
		<PopoverPopup popupClassName="w-64 max-h-80 overflow-hidden flex flex-col p-0">
			{states.length === 0 ? (
				<p
					style={{
						padding: 'var(--space-4) var(--space-5)',
						fontSize: 'var(--text-12)',
						color: 'var(--fg-dim)'
					}}
				>
					No statuses available for this team.
				</p>
			) : (
				<>
					<PopBody ariaLabel="Status">
						{states.map((state) => (
							<Popline
								key={state.id}
								selected={state.id === currentId}
								onClick={() => onSelect(state)}
							>
								<StatusIcon
									kind={statusIconKindFor({
										state_type: state.state_type,
										name: state.name
									})}
									size={13}
									color={state.color}
								/>
								<span>{state.name}</span>
							</Popline>
						))}
					</PopBody>
					<PopFooter>Hold ⌥ to exclude</PopFooter>
				</>
			)}
		</PopoverPopup>
	)
}
