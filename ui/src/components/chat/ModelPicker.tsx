import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { AgentProvider } from '@/types'
import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown, Cpu } from 'lucide-react'

export interface ModelOption {
	/** Wire value forwarded to the provider CLI. `null` = use default. */
	value: string | null
	label: string
}

const CLAUDE_MODELS: ModelOption[] = [
	{ value: null, label: 'Default' },
	{ value: 'claude-opus-4-7', label: 'Opus 4.7' },
	{ value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
	{ value: 'claude-haiku-4-5', label: 'Haiku 4.5' }
]

const CODEX_MODELS: ModelOption[] = [
	{ value: null, label: 'Default' },
	{ value: 'gpt-5', label: 'GPT-5' },
	{ value: 'gpt-5-mini', label: 'GPT-5 mini' }
]

export function modelOptionsFor(provider: AgentProvider): ModelOption[] {
	return provider === 'claude' ? CLAUDE_MODELS : CODEX_MODELS
}

interface ModelPickerProps {
	/** `null` = no provider chosen yet (launcher mode); the picker renders a
	 * neutral placeholder so the visible label does not lie about the model
	 * the not-yet-existing provider would use. */
	provider: AgentProvider | null
	value: string | null
	onChange: (next: string | null) => void
	disabled?: boolean
}

const SENTINEL_DEFAULT = '__default__'

/**
 * Composer-embedded model picker. Mirrors `ModePicker` (popover menu) so the
 * two pickers compose visually as a single toolbar pill row.
 */
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
