import { useState } from 'react'

import { PopoverPopup } from '@/components/ui/popover-shell'
import { Btn } from '@/ui/Btn'

interface DueDatePickerProps {
	current: string | null
	onApply: (next: string | null) => void
}

export function DueDatePicker({ current, onApply }: DueDatePickerProps) {
	const [value, setValue] = useState(current ?? '')

	return (
		<PopoverPopup popupClassName="w-72 p-3">
			<label htmlFor="due-date-input" className="block text-[11px] font-medium text-fg-dim">
				Due date
			</label>
			<input
				id="due-date-input"
				type="date"
				value={value}
				onChange={(event) => setValue(event.target.value)}
				autoFocus
				aria-label="Due date"
				className="mt-1.5 w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[13px] text-fg focus:border-border-strong focus:outline-none"
			/>
			<div className="mt-3 flex items-center justify-between gap-2">
				<button
					type="button"
					onClick={() => onApply(null)}
					className="text-[11.5px] text-fg-dim hover:text-fg focus-visible:underline focus-visible:outline-none"
				>
					Clear
				</button>
				<Btn kind="primary" size="sm" onClick={() => onApply(value.length > 0 ? value : null)}>
					Apply
				</Btn>
			</div>
		</PopoverPopup>
	)
}
