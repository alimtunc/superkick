import { MenuPopup } from '@/components/composites/menu-shell'
import { PROVIDER_OPTIONS } from '@/lib/chatPickerOptions'
import { cn } from '@/lib/utils'
import type { AgentProvider } from '@/types'
import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown, CircleDashed } from 'lucide-react'

interface ProviderPickerProps {
	value: AgentProvider | null
	onChange: (next: AgentProvider) => void
	disabled?: boolean
}

export function ProviderPicker({ value, onChange, disabled }: ProviderPickerProps) {
	const current = PROVIDER_OPTIONS.find((o) => o.value === value)
	const triggerLabel = current ? `Provider: ${current.label}` : 'Choose provider'

	return (
		<Menu.Root>
			<Menu.Trigger
				disabled={disabled}
				title={triggerLabel}
				aria-label={triggerLabel}
				className="font-data inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-[11px] text-fg hover:bg-surface focus:border-border-strong focus:outline-none disabled:opacity-60"
			>
				<span aria-hidden="true" className="text-fg">
					{current?.icon ?? <CircleDashed size={14} strokeWidth={1.75} />}
				</span>
				<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" className="text-fg-dim" />
			</Menu.Trigger>
			<MenuPopup align="start" popupClassName="font-data w-44 border-border bg-surface">
				<Menu.RadioGroup
					value={value ?? ''}
					onValueChange={(next) => onChange(next as AgentProvider)}
				>
					{PROVIDER_OPTIONS.map((opt) => (
						<Menu.RadioItem
							key={opt.value}
							value={opt.value}
							className={cn(
								'flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 outline-none',
								'data-highlighted:bg-surface data-checked:bg-surface'
							)}
						>
							<span className="flex items-center gap-2">
								<span aria-hidden="true" className="text-fg-dim">
									{opt.icon}
								</span>
								<span className="text-[12px] text-fg">{opt.label}</span>
							</span>
							<Menu.RadioItemIndicator className="text-fg">
								<Check size={12} strokeWidth={2} aria-hidden="true" />
							</Menu.RadioItemIndicator>
						</Menu.RadioItem>
					))}
				</Menu.RadioGroup>
			</MenuPopup>
		</Menu.Root>
	)
}
