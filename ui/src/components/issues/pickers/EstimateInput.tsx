import { useState, type KeyboardEvent } from 'react'

import { PopoverPopup } from '@/components/ui/popover-shell'
import { Btn } from '@/ui/Btn'

interface EstimateInputProps {
	current: number | null
	onApply: (next: number | null) => void
}

function parseEstimate(raw: string): number | null {
	if (raw.trim().length === 0) return null
	const parsed = Number(raw)
	if (!Number.isFinite(parsed) || parsed < 0) return null
	return parsed
}

export function EstimateInput({ current, onApply }: EstimateInputProps) {
	const [value, setValue] = useState(current === null ? '' : String(current))

	const apply = () => onApply(parseEstimate(value))

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter') {
			event.preventDefault()
			apply()
		}
	}

	return (
		<PopoverPopup popupClassName="w-64 p-3">
			<label htmlFor="estimate-input" className="block text-[11px] font-medium text-fg-dim">
				Estimate (points)
			</label>
			<input
				id="estimate-input"
				type="number"
				min={0}
				step={1}
				value={value}
				onChange={(event) => setValue(event.target.value)}
				onKeyDown={onKeyDown}
				autoFocus
				placeholder="e.g. 3"
				aria-label="Estimate"
				className="mt-1.5 w-full rounded border border-border bg-canvas px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
			/>
			<div className="mt-3 flex items-center justify-between gap-2">
				<button
					type="button"
					onClick={() => onApply(null)}
					className="text-[11.5px] text-fg-dim hover:text-fg focus-visible:underline focus-visible:outline-none"
				>
					Clear
				</button>
				<Btn kind="primary" size="sm" onClick={apply}>
					Apply
				</Btn>
			</div>
		</PopoverPopup>
	)
}
