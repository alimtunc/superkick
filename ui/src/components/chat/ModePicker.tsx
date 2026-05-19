import { MenuPopup } from '@/components/ui/menu-shell'
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
				className="font-data hover:bg-carbon-dim inline-flex h-7 items-center gap-1 rounded-md border border-edge bg-carbon px-2 text-[11px] text-fog focus:border-edge-bright focus:outline-none disabled:opacity-60"
			>
				<span aria-hidden="true" className="text-fog">
					{current?.icon}
				</span>
				<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" className="text-dim" />
			</Menu.Trigger>
			<MenuPopup align="start" popupClassName="font-data w-72 border-edge bg-carbon">
				<Menu.RadioGroup value={value} onValueChange={(next) => onChange(next as ChatPermissionMode)}>
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
			</MenuPopup>
		</Menu.Root>
	)
}
