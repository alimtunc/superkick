import { useState } from 'react'

import { PopoverPopup } from '@/components/ui/popover-shell'
import type { LabelOption } from '@/types'
import { Btn } from '@/ui/Btn'

import { PopBody, PopFooter, PopHeader, Popline } from './popoverParts'

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
			<PopHeader
				value={query}
				onChange={setQuery}
				placeholder="Add labels…"
				ariaLabel="Filter labels"
			/>
			<PopBody ariaLabel="Labels" multi>
				{filtered.length === 0 ? (
					<p
						style={{
							padding: 'var(--space-3) var(--space-4)',
							fontSize: 'var(--text-12)',
							color: 'var(--fg-dim)'
						}}
					>
						No labels match.
					</p>
				) : (
					filtered.map((label) => (
						<Popline
							key={label.id}
							selected={draft.has(label.id)}
							onClick={() => toggle(label.id)}
						>
							<span
								aria-hidden="true"
								style={{
									width: 7,
									height: 7,
									borderRadius: '50%',
									backgroundColor: label.color,
									flex: 'none'
								}}
							/>
							<span className="truncate">{label.name}</span>
						</Popline>
					))
				)}
			</PopBody>
			<PopFooter>
				<span>Hold ⌥ to exclude</span>
				<span style={{ marginLeft: 'auto' }}>
					<Btn kind="primary" size="sm" onClick={() => onApply([...draft])}>
						Apply
					</Btn>
				</span>
			</PopFooter>
		</PopoverPopup>
	)
}
