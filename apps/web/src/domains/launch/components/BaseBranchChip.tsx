import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { PopoverPopup } from '@/components/composites/popover-shell'
import { Btn, Icon } from '@/components/primitives'
import { Popover } from '@base-ui/react/popover'

interface BaseBranchChipProps {
	value: string
	configDefault: string
	onChange: (next: string) => void
}

export function BaseBranchChip({ value, configDefault, onChange }: BaseBranchChipProps) {
	const [open, setOpen] = useState(false)
	const [draft, setDraft] = useState(value)
	const inputId = useId()
	const baselineRef = useRef(value)

	useEffect(() => {
		if (!open) return
		baselineRef.current = value
		setDraft(value)
	}, [open, value])

	function commit(next: string) {
		const trimmed = next.trim()
		if (trimmed.length === 0) return
		onChange(trimmed)
		setOpen(false)
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.key === 'Enter') {
			event.preventDefault()
			commit(draft)
			return
		}
		if (event.key === 'Escape') {
			event.preventDefault()
			setDraft(baselineRef.current)
			setOpen(false)
		}
	}

	const trimmed = draft.trim()
	const canCommit = trimmed.length > 0 && trimmed !== value
	const isDiverged = value.trim() !== configDefault.trim()

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger aria-label={`Base branch: ${value}`} className="select">
				<Icon name="branch" size={14} className="ic text-fg-muted" />
				<span className="text-fg-dim">base</span>
				<span className="font-medium text-fg">{value}</span>
				<span className="chev">
					<Icon name="chevDown" size={14} className="ic" />
				</span>
			</Popover.Trigger>
			<PopoverPopup align="start" popupClassName="w-64 p-3" initialFocus={false}>
				<label htmlFor={inputId} className="block text-[11px] font-medium text-fg-dim">
					Base branch
				</label>
				<input
					id={inputId}
					type="text"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={configDefault}
					autoFocus
					spellCheck={false}
					className="bg-bg mt-1.5 w-full rounded-md border border-border px-2.5 py-1.5 text-[13px] text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
					aria-label="Base branch name"
				/>
				<div className="mt-2.5 flex items-center justify-between gap-2">
					{isDiverged ? (
						<button
							type="button"
							onClick={() => commit(configDefault)}
							className="text-[11px] text-fg-dim hover:text-fg focus-visible:underline focus-visible:outline-none"
						>
							Reset to {configDefault}
						</button>
					) : (
						<span className="text-[11px] text-fg-dim">Default · {configDefault}</span>
					)}
					<Btn kind="primary" size="sm" onClick={() => commit(draft)} disabled={!canCommit}>
						Apply
					</Btn>
				</div>
			</PopoverPopup>
		</Popover.Root>
	)
}
