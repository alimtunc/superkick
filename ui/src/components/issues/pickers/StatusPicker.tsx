import { PopoverPopup } from '@/components/ui/popover-shell'
import type { WorkflowStateOption } from '@/types'
import { StatusIcon, statusIconKindFor } from '@/ui'

interface StatusPickerProps {
	states: WorkflowStateOption[]
	currentId: string | null
	onSelect: (next: WorkflowStateOption) => void
}

export function StatusPicker({ states, currentId, onSelect }: StatusPickerProps) {
	return (
		<PopoverPopup popupClassName="w-64 max-h-80 overflow-y-auto p-1">
			{states.length === 0 ? (
				<p className="px-3 py-2 text-[12px] text-fg-dim">No statuses available for this team.</p>
			) : (
				<div className="flex flex-col gap-0.5" role="listbox" aria-label="Status">
					{states.map((state) => {
						const selected = state.id === currentId
						return (
							<button
								key={state.id}
								type="button"
								role="option"
								aria-selected={selected}
								onClick={() => onSelect(state)}
								className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-fg hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
							>
								<span className="inline-flex items-center gap-2">
									<StatusIcon
										kind={statusIconKindFor({
											state_type: state.state_type,
											name: state.name
										})}
										size={13}
										color={state.color}
									/>
									<span>{state.name}</span>
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
