import type { AgentProvider } from '@/types'

export interface AgentPickerOption {
	agentId: string
	provider: AgentProvider
	label: string
}

export interface AgentPickerProps {
	options: AgentPickerOption[]
	value: { agentId: string; provider: AgentProvider } | null
	onChange: (next: { agentId: string; provider: AgentProvider }) => void
	disabled?: boolean
}

const KEY_SEP = '::'

function optionKey(o: { agentId: string; provider: AgentProvider }): string {
	return `${o.provider}${KEY_SEP}${o.agentId}`
}

/**
 * Minimal provider+agent picker. Backed by a list passed by the caller —
 * the chat panel decides where the catalogue comes from (today: a static
 * list of `claude` / `codex` provider stubs; later: a runtime registry).
 */
export function AgentPicker({ options, value, onChange, disabled }: AgentPickerProps) {
	const selectedKey = value ? optionKey(value) : ''

	return (
		<label className="font-data flex items-center gap-2 text-[11px] text-dim">
			<span className="tracking-wider uppercase">Agent</span>
			<select
				value={selectedKey}
				disabled={disabled}
				onChange={(e) => {
					const [provider, agentId] = e.target.value.split(KEY_SEP)
					if (!provider || !agentId) return
					onChange({ agentId, provider: provider as AgentProvider })
				}}
				className="font-data rounded-md border border-edge bg-carbon px-2 py-1 text-[11px] text-fog focus:border-edge-bright focus:outline-none"
			>
				<option value="" disabled>
					Select an agent
				</option>
				{options.map((opt) => (
					<option key={optionKey(opt)} value={optionKey(opt)}>
						{opt.label}
					</option>
				))}
			</select>
		</label>
	)
}
