import { PopoverPopup } from '@/components/ui/popover-shell'
import { PRIORITY_META } from '@/lib/domain/priorityMeta'
import { PriorityIcon, priorityIconKindFromValue } from '@/ui'

interface PriorityPickerProps {
	currentValue: number
	onSelect: (next: number) => void
}

const PRIORITY_VALUES: number[] = [0, 1, 2, 3, 4]

export function PriorityPicker({ currentValue, onSelect }: PriorityPickerProps) {
	return (
		<PopoverPopup popupClassName="w-52 p-1">
			<div role="listbox" aria-label="Priority" className="flex flex-col gap-0.5">
				{PRIORITY_VALUES.map((value) => {
					const meta = PRIORITY_META[value]
					const selected = value === currentValue
					return (
						<button
							key={value}
							type="button"
							role="option"
							aria-selected={selected}
							onClick={() => onSelect(value)}
							className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-fg hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
						>
							<span className="inline-flex items-center gap-2">
								<PriorityIcon kind={priorityIconKindFromValue(value)} size={12} />
								<span>{meta?.label ?? `Priority ${value}`}</span>
							</span>
							{selected ? <span className="text-fg-dim">✓</span> : null}
						</button>
					)
				})}
			</div>
		</PopoverPopup>
	)
}
