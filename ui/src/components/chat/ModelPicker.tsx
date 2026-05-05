import type { AgentProvider } from '@/types'

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
	provider: AgentProvider
	value: string | null
	onChange: (next: string | null) => void
	disabled?: boolean
}

const SENTINEL_DEFAULT = '__default__'

export function ModelPicker({ provider, value, onChange, disabled }: ModelPickerProps) {
	const options = modelOptionsFor(provider)
	const selectedKey = value ?? SENTINEL_DEFAULT

	return (
		<label className="font-data flex items-center gap-2 text-[11px] text-dim">
			<span className="tracking-wider uppercase">Model</span>
			<select
				value={selectedKey}
				disabled={disabled}
				onChange={(e) => onChange(e.target.value === SENTINEL_DEFAULT ? null : e.target.value)}
				className="font-data rounded-md border border-edge bg-carbon px-2 py-1 text-[11px] text-fog focus:border-edge-bright focus:outline-none"
			>
				{options.map((opt) => (
					<option key={opt.value ?? SENTINEL_DEFAULT} value={opt.value ?? SENTINEL_DEFAULT}>
						{opt.label}
					</option>
				))}
			</select>
		</label>
	)
}
