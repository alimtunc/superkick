import type { ReactNode } from 'react'

import { MenuPopup } from '@/components/ui/menu-shell'
import { cn } from '@/lib/utils'
import type { AgentProvider } from '@/types'
import { Menu } from '@base-ui/react/menu'
import { Bot, Check, ChevronDown, CircleDashed, Sparkles } from 'lucide-react'

interface ProviderOption {
	value: AgentProvider
	label: string
	icon: ReactNode
}

const PROVIDER_OPTIONS: ProviderOption[] = [
	{ value: 'claude', label: 'Claude', icon: <Sparkles size={14} strokeWidth={1.75} /> },
	{ value: 'codex', label: 'Codex', icon: <Bot size={14} strokeWidth={1.75} /> }
]

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
				className="font-data hover:bg-carbon-dim inline-flex h-7 items-center gap-1 rounded-md border border-edge bg-carbon px-2 text-[11px] text-fog focus:border-edge-bright focus:outline-none disabled:opacity-60"
			>
				<span aria-hidden="true" className="text-fog">
					{current?.icon ?? <CircleDashed size={14} strokeWidth={1.75} />}
				</span>
				<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" className="text-dim" />
			</Menu.Trigger>
			<MenuPopup align="start" popupClassName="font-data w-44 border-edge bg-carbon">
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
								'data-highlighted:bg-carbon-dim data-checked:bg-carbon-dim'
							)}
						>
							<span className="flex items-center gap-2">
								<span aria-hidden="true" className="text-dim">
									{opt.icon}
								</span>
								<span className="text-[12px] text-fog">{opt.label}</span>
							</span>
							<Menu.RadioItemIndicator className="text-fog">
								<Check size={12} strokeWidth={2} aria-hidden="true" />
							</Menu.RadioItemIndicator>
						</Menu.RadioItem>
					))}
				</Menu.RadioGroup>
			</MenuPopup>
		</Menu.Root>
	)
}
