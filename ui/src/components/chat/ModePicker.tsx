import { Tooltip } from '@/components/ui/tooltip'
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

	return (
		<Menu.Root>
			<Tooltip label={current?.label ?? null}>
				<Menu.Trigger
					disabled={disabled}
					aria-label={current ? `Mode: ${current.label}` : 'Mode'}
					className="font-data hover:bg-carbon-dim inline-flex h-7 items-center gap-1 rounded-md border border-edge bg-carbon px-2 text-[11px] text-fog focus:border-edge-bright focus:outline-none disabled:opacity-60"
				>
					<span aria-hidden="true" className="text-fog">
						{current?.icon}
					</span>
					<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" className="text-dim" />
				</Menu.Trigger>
			</Tooltip>
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
