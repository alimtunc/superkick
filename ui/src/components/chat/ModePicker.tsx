import type { ChatPermissionMode } from '@/types'

export interface ModeOption {
	value: ChatPermissionMode
	label: string
	description: string
}

export const DEFAULT_MODE_OPTIONS: ModeOption[] = [
	{
		value: 'ask_before_edits',
		label: 'Ask before edits',
		description: 'Agent will ask for approval before making each edit.'
	},
	{
		value: 'edit_automatically',
		label: 'Edit automatically',
		description: 'Agent will edit your selected text or the whole file.'
	},
	{
		value: 'plan_mode',
		label: 'Plan mode',
		description: 'Agent will explore the code and present a plan before editing.'
	},
	{
		value: 'auto_mode',
		label: 'Auto mode',
		description: 'Agent will automatically choose the best permission mode for each task.'
	}
]

interface ModePickerProps {
	value: ChatPermissionMode
	onChange: (next: ChatPermissionMode) => void
	disabled?: boolean
}

export function ModePicker({ value, onChange, disabled }: ModePickerProps) {
	const current = DEFAULT_MODE_OPTIONS.find((o) => o.value === value)
	return (
		<label
			className="font-data flex items-center gap-2 text-[11px] text-dim"
			title={current?.description}
		>
			<span className="tracking-wider uppercase">Mode</span>
			<select
				value={value}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value as ChatPermissionMode)}
				className="font-data rounded-md border border-edge bg-carbon px-2 py-1 text-[11px] text-fog focus:border-edge-bright focus:outline-none"
			>
				{DEFAULT_MODE_OPTIONS.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</label>
	)
}
