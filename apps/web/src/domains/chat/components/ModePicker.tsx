import { MenuPopup } from '@/components/composites/menu-shell'
import { DEFAULT_MODE_OPTIONS } from '@/lib/chatPickerOptions'
import { cn } from '@/lib/utils'
import type { ChatPermissionMode } from '@/types'
import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown } from 'lucide-react'

interface ModePickerProps {
	value: ChatPermissionMode
	onChange: (next: ChatPermissionMode) => void
	disabled?: boolean
}

export function ModePicker({ value, onChange, disabled }: ModePickerProps) {
	const current = DEFAULT_MODE_OPTIONS.find((o) => o.value === value) ?? DEFAULT_MODE_OPTIONS[1]
	const triggerLabel = current ? `Mode: ${current.label}` : 'Mode'

	return (
		<Menu.Root>
			<Menu.Trigger
				disabled={disabled}
				title={triggerLabel}
				aria-label={triggerLabel}
				className="font-data inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-[11px] text-fg hover:bg-surface focus:border-border-strong focus:outline-none disabled:opacity-60"
			>
				<span aria-hidden="true" className="text-fg">
					{current?.icon}
				</span>
				<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" className="text-fg-dim" />
			</Menu.Trigger>
			<MenuPopup align="start" popupClassName="font-data w-72 border-border bg-surface">
				<Menu.RadioGroup value={value} onValueChange={(next) => onChange(next as ChatPermissionMode)}>
					{DEFAULT_MODE_OPTIONS.map((opt) => (
						<Menu.RadioItem
							key={opt.value}
							value={opt.value}
							className={cn(
								'flex cursor-pointer items-start gap-2 px-3 py-2 outline-none',
								'data-highlighted:bg-surface data-checked:bg-surface'
							)}
						>
							<span aria-hidden="true" className="mt-0.5 text-fg-dim">
								{opt.icon}
							</span>
							<span className="flex-1">
								<span className="block text-[12px] text-fg">{opt.label}</span>
								<span className="block text-[10px] text-fg-dim">{opt.description}</span>
							</span>
							<Menu.RadioItemIndicator className="mt-0.5 text-fg">
								<Check size={12} strokeWidth={2} aria-hidden="true" />
							</Menu.RadioItemIndicator>
						</Menu.RadioItem>
					))}
				</Menu.RadioGroup>
			</MenuPopup>
		</Menu.Root>
	)
}
