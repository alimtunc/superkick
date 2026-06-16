import { PopoverPopup } from '@/components/composites/popover-shell'
import { PriorityIcon } from '@/components/primitives'
import { priorityIconKindFromValue } from '@/lib/domain'
import { PRIORITY_META } from '@/lib/domain/priorityMeta'

import { PopBody, Popline } from './popoverParts'

interface PriorityPickerProps {
	currentValue: number
	onSelect: (next: number) => void
}

const PRIORITY_VALUES: number[] = [1, 2, 3, 4, 0]

export function PriorityPicker({ currentValue, onSelect }: PriorityPickerProps) {
	return (
		<PopoverPopup popupClassName="w-[200px] p-0">
			<PopBody ariaLabel="Priority">
				{PRIORITY_VALUES.map((value) => {
					const meta = PRIORITY_META[value]
					return (
						<Popline
							key={value}
							selected={value === currentValue}
							onClick={() => onSelect(value)}
						>
							<PriorityIcon kind={priorityIconKindFromValue(value)} size={14} />
							<span>{meta?.label ?? `Priority ${value}`}</span>
						</Popline>
					)
				})}
			</PopBody>
		</PopoverPopup>
	)
}
