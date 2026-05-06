import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import type { ChatPermissionMode } from '@/types'
import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown, ClipboardList, CodeXml, Hand, Sparkles } from 'lucide-react'

export interface ModeOption {
	value: ChatPermissionMode
	label: string
	description: string
	icon: ReactNode
}

export const DEFAULT_MODE_OPTIONS: ModeOption[] = [
	{
		value: 'ask_before_edits',
		label: 'Ask before edits',
		description: 'Agent will ask for approval before making each edit.',
		icon: <Hand size={14} strokeWidth={1.75} />
	},
	{
		value: 'edit_automatically',
		label: 'Edit automatically',
		description: 'Agent will edit your selected text or the whole file.',
		icon: <CodeXml size={14} strokeWidth={1.75} />
	},
	{
		value: 'plan_mode',
		label: 'Plan mode',
		description: 'Agent will explore the code and present a plan before editing.',
		icon: <ClipboardList size={14} strokeWidth={1.75} />
	},
	{
		value: 'auto_mode',
		label: 'Auto mode',
		description: 'Agent will automatically choose the best permission mode for each task.',
		icon: <Sparkles size={14} strokeWidth={1.75} />
	}
]

interface ModePickerProps {
	value: ChatPermissionMode
	onChange: (next: ChatPermissionMode) => void
	disabled?: boolean
}

/**
 * Composer-embedded mode picker. Renders as a compact pill button that
 * opens a popover menu with icon + label + description per option, mirroring
 * the Claude Code terminal mode chooser.
 */
export function ModePicker({ value, onChange, disabled }: ModePickerProps) {
	const current = DEFAULT_MODE_OPTIONS.find((o) => o.value === value) ?? DEFAULT_MODE_OPTIONS[1]

	return (
		<Menu.Root>
			<Menu.Trigger
				disabled={disabled}
				className="font-data hover:bg-carbon-dim inline-flex h-7 items-center gap-1.5 rounded-md border border-edge bg-carbon px-2 text-[11px] text-fog focus:border-edge-bright focus:outline-none disabled:opacity-60"
			>
				<span aria-hidden="true" className="text-dim">
					{current?.icon}
				</span>
				<span>{current?.label}</span>
				<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" className="text-dim" />
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner sideOffset={6} align="start" className="z-50">
					<Menu.Popup className="font-data w-72 overflow-hidden rounded-md border border-edge bg-carbon shadow-lg">
						<Menu.RadioGroup
							value={value}
							onValueChange={(next) => onChange(next as ChatPermissionMode)}
						>
							{DEFAULT_MODE_OPTIONS.map((opt) => (
								<Menu.RadioItem
									key={opt.value}
									value={opt.value}
									className={cn(
										'flex cursor-pointer items-start gap-2 px-3 py-2 outline-none',
										'data-highlighted:bg-carbon-dim data-checked:bg-carbon-dim'
									)}
								>
									<span aria-hidden="true" className="mt-0.5 text-dim">
										{opt.icon}
									</span>
									<span className="flex-1">
										<span className="block text-[12px] text-fog">{opt.label}</span>
										<span className="block text-[10px] text-dim">{opt.description}</span>
									</span>
									<Menu.RadioItemIndicator className="mt-0.5 text-fog">
										<Check size={12} strokeWidth={2} aria-hidden="true" />
									</Menu.RadioItemIndicator>
								</Menu.RadioItem>
							))}
						</Menu.RadioGroup>
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	)
}
