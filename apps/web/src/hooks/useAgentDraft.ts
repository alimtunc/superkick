import { useEffect, useState } from 'react'

import { agentExecutor, commaList, runnerModeForExecutor, slugifyAgentName } from '@/lib/agents'
import { clampExecutorForProvider, clampReasoningForProvider } from '@/lib/launchConfigOptions'
import type { AgentProvider, ManagedAgent, StepExecutor } from '@/types'

interface UseAgentDraft {
	draft: ManagedAgent
	/** The name the editor submits in create mode (slugified); `seed.name` in edit mode. */
	slug: string
	nameTyped: boolean
	/** A name was typed but slugifies to nothing (e.g. punctuation only). */
	slugEmpty: boolean
	update: (patch: Partial<ManagedAgent>) => void
	setProvider: (provider: AgentProvider) => void
	setExecutor: (executor: StepExecutor) => void
	setSystemPrompt: (value: string) => void
	setDescription: (value: string) => void
	setMcpServers: (value: string) => void
	setToolDeny: (value: string) => void
	setToolAllow: (value: string) => void
}

/** Local editable copy of an agent for the editor dialog. Owns the draft state,
 *  the reset-on-open effect, and the field setters (provider/executor clamping
 *  and comma-list parsing). */
export function useAgentDraft(seed: ManagedAgent, open: boolean, mode: 'create' | 'edit'): UseAgentDraft {
	const [draft, setDraft] = useState<ManagedAgent>(seed)

	useEffect(() => {
		if (open) setDraft(seed)
	}, [open, seed])

	function update(patch: Partial<ManagedAgent>) {
		setDraft((prev) => ({ ...prev, ...patch }))
	}

	function setProvider(provider: AgentProvider) {
		setDraft((prev) => {
			const executor = clampExecutorForProvider(agentExecutor(prev), provider)
			return {
				...prev,
				provider,
				default_reasoning: clampReasoningForProvider(prev.default_reasoning, provider),
				runner_mode: runnerModeForExecutor(executor)
			}
		})
	}

	function setExecutor(executor: StepExecutor) {
		update({ runner_mode: runnerModeForExecutor(executor) })
	}

	function setSystemPrompt(value: string) {
		const trimmed = value.trim()
		update({ system_prompt: trimmed.length > 0 ? value : null })
	}

	function setDescription(value: string) {
		update({ description: value.length > 0 ? value : null })
	}

	function setMcpServers(value: string) {
		const servers = commaList(value)
		update({ mcp_policy: { mode: servers.length > 0 ? 'servers' : 'none', servers } })
	}

	function setToolDeny(value: string) {
		const deny = commaList(value)
		update({ tool_policy: { ...draft.tool_policy, deny: deny.length > 0 ? deny : null } })
	}

	function setToolAllow(value: string) {
		const allow = commaList(value)
		update({ tool_policy: { ...draft.tool_policy, allow: allow.length > 0 ? allow : null } })
	}

	const nameTyped = draft.name.trim().length > 0
	const slug = mode === 'create' ? slugifyAgentName(draft.name) : seed.name
	const slugEmpty = nameTyped && slug.length === 0

	return {
		draft,
		slug,
		nameTyped,
		slugEmpty,
		update,
		setProvider,
		setExecutor,
		setSystemPrompt,
		setDescription,
		setMcpServers,
		setToolDeny,
		setToolAllow
	}
}
