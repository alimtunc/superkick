import { PopoverPopup } from '@/components/composites/popover-shell'
import { StatusIcon, EmptyState } from '@/components/primitives'
import { statusIconKindFor } from '@/lib/domain'
import type { WorkflowStateOption } from '@/types'

import { PopBody, Popline } from './popoverParts'

interface StatusPickerProps {
	states: WorkflowStateOption[]
	currentId: string | null
	onSelect: (next: WorkflowStateOption) => void
}

export function StatusPicker({ states, currentId, onSelect }: StatusPickerProps) {
	return (
		<PopoverPopup popupClassName="w-64 max-h-80 overflow-hidden flex flex-col p-0">
			{states.length === 0 ? (
				<div className="p-3">
					<EmptyState title="No statuses available for this team." density="compact" />
				</div>
			) : (
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
			)}
		</PopoverPopup>
	)
}
