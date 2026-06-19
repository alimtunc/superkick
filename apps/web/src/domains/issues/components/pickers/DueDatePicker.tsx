import { useState } from 'react'

import { PopoverPopup } from '@/components/composites/popover-shell'
import { Btn } from '@/components/primitives'

import { PopFooter } from './popoverParts'

interface DueDatePickerProps {
	current: string | null
	onApply: (next: string | null) => void
}

export function DueDatePicker({ current, onApply }: DueDatePickerProps) {
	const [value, setValue] = useState(current ?? '')

	return (
		<PopoverPopup popupClassName="w-72 overflow-hidden flex flex-col p-0">
			<div style={{ padding: 'var(--space-5)' }}>
				<label
					htmlFor="due-date-input"
					className="block text-fg-dim"
					style={{ fontSize: 'var(--text-11)', fontWeight: 'var(--fw-medium)' }}
				>
					Due date
				</label>
				<input
					id="due-date-input"
					type="date"
					value={value}
					onChange={(event) => setValue(event.target.value)}
					autoFocus
					aria-label="Due date"
					className="input"
					style={{ marginTop: 'var(--space-3)', width: '100%' }}
				/>
			</div>
			<PopFooter>
				<button
					type="button"
					onClick={() => onApply(null)}
					className="text-fg-dim hover:text-fg focus-visible:underline focus-visible:outline-none"
					style={{ fontSize: 'var(--text-12)' }}
				>
					Clear
				</button>
				<span style={{ marginLeft: 'auto' }}>
					<Btn kind="primary" size="sm" onClick={() => onApply(value.length > 0 ? value : null)}>
						Apply
					</Btn>
				</span>
			</PopFooter>
		</PopoverPopup>
	)
}
