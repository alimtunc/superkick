import { MenuPopup } from '@/components/composites/menu-shell'
import { modelOptionsFor } from '@/lib/chatPickerOptions'
import { cn } from '@/lib/utils'
import type { AgentProvider } from '@/types'
import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown, Cpu } from 'lucide-react'

interface ModelPickerProps {
	provider: AgentProvider | null
	value: string | null
	onChange: (next: string | null) => void
	disabled?: boolean
}

const SENTINEL_DEFAULT = '__default__'

export function ModelPicker({ provider, value, onChange, disabled }: ModelPickerProps) {
	const options = provider !== null ? modelOptionsFor(provider) : []
	const current = options.find((o) => o.value === value) ?? options[0]
	const triggerLabel = current ? `Model: ${current.label}` : 'Model'

	return (
		<Menu.Root>
			<Menu.Trigger
				disabled={disabled}
				title={triggerLabel}
				aria-label={triggerLabel}
				className="font-data inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-[11px] text-fg hover:bg-surface focus:border-border-strong focus:outline-none disabled:opacity-60"
			>
				<Cpu size={14} strokeWidth={1.75} aria-hidden="true" className="text-fg" />
				<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" className="text-fg-dim" />
			</Menu.Trigger>
			<MenuPopup align="start" popupClassName="font-data w-44 border-border bg-surface">
				<Menu.RadioGroup
					value={value ?? SENTINEL_DEFAULT}
					onValueChange={(next) =>
						onChange(typeof next === 'string' && next !== SENTINEL_DEFAULT ? next : null)
					}
				>
					{options.map((opt) => (
						<Menu.RadioItem
							key={opt.value ?? SENTINEL_DEFAULT}
							value={opt.value ?? SENTINEL_DEFAULT}
							className={cn(
								'flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 outline-none',
								'data-highlighted:bg-surface data-checked:bg-surface'
							)}
						>
							<span className="text-[12px] text-fg">{opt.label}</span>
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
