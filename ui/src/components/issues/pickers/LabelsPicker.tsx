import { useState } from 'react'

import { PopoverPopup } from '@/components/ui/popover-shell'
import type { LabelOption } from '@/types'
import { Btn } from '@/ui/Btn'

interface LabelsPickerProps {
	labels: LabelOption[]
	selectedIds: string[]
	onApply: (nextIds: string[]) => void
}

export function LabelsPicker({ labels, selectedIds, onApply }: LabelsPickerProps) {
	const [draft, setDraft] = useState<Set<string>>(() => new Set(selectedIds))
	const [query, setQuery] = useState('')
	const filtered =
		query.trim().length === 0
			? labels
			: labels.filter((label) => label.name.toLowerCase().includes(query.toLowerCase()))

	const toggle = (id: string) => {
		setDraft((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	return (
		<PopoverPopup popupClassName="w-72 max-h-80 overflow-hidden flex flex-col p-0">
			<div className="border-b border-border p-2">
				<input
					type="text"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search labels…"
					autoFocus
					className="w-full rounded border border-border bg-canvas px-2 py-1.5 text-[12.5px] text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
					aria-label="Filter labels"
				/>
			</div>
			<div
				className="flex flex-1 flex-col overflow-y-auto p-1"
				role="listbox"
				aria-label="Labels"
				aria-multiselectable
			>
				{filtered.length === 0 ? (
					<p className="px-2 py-1.5 text-[12px] text-fg-dim">No labels match.</p>
				) : (
					filtered.map((label) => {
						const selected = draft.has(label.id)
						return (
							<button
								key={label.id}
								type="button"
								role="option"
								aria-selected={selected}
								onClick={() => toggle(label.id)}
								className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-fg hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
							>
								<span className="inline-flex items-center gap-2">
									<span
										aria-hidden="true"
										className="inline-block size-2 rounded-full"
										style={{ backgroundColor: label.color }}
									/>
									<span className="truncate">{label.name}</span>
								</span>
								{selected ? <span className="text-fg-dim">✓</span> : null}
							</button>
						)
					})
				)}
			</div>
			<div className="flex items-center justify-end gap-2 border-t border-border p-2">
				<Btn kind="primary" size="sm" onClick={() => onApply([...draft])}>
					Apply
				</Btn>
			</div>
		</PopoverPopup>
	)
}
