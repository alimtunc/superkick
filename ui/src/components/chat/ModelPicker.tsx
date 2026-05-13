import { Tooltip } from '@/components/ui/tooltip'
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
	const label = provider === null ? 'Model' : (current?.label ?? 'Default')

	return (
		<Menu.Root>
			<Tooltip label={`Model: ${label}`}>
				<Menu.Trigger
					disabled={disabled}
					aria-label={`Model: ${label}`}
					className="font-data hover:bg-carbon-dim inline-flex h-7 items-center gap-1 rounded-md border border-edge bg-carbon px-2 text-[11px] text-fog focus:border-edge-bright focus:outline-none disabled:opacity-60"
				>
					<Cpu size={14} strokeWidth={1.75} aria-hidden="true" className="text-fog" />
					<ChevronDown size={12} strokeWidth={1.75} aria-hidden="true" className="text-dim" />
				</Menu.Trigger>
			</Tooltip>
			<Menu.Portal>
				<Menu.Positioner sideOffset={6} align="start" className="z-50">
					<Menu.Popup className="font-data w-44 overflow-hidden rounded-md border border-edge bg-carbon shadow-lg">
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
										'data-highlighted:bg-carbon-dim data-checked:bg-carbon-dim'
									)}
								>
									<span className="text-[12px] text-fog">{opt.label}</span>
									<Menu.RadioItemIndicator className="text-fog">
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
