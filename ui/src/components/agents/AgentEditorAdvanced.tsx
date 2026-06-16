import { useState } from 'react'

import { SkillEditorField } from '@/components/settings/SkillEditorField'
import { MenuSelect } from '@/components/ui/menu-select'
import { agentExecutor } from '@/lib/agents'
import {
	EXECUTOR_LABEL,
	REASONING_LABEL,
	executorOptionsFor,
	reasoningOptionsFor
} from '@/lib/launchConfigOptions'
import type { ManagedAgent, StepExecutor } from '@/types'
import { LINEAR_CONTEXT_LABEL, LINEAR_CONTEXT_OPTIONS } from '@/types'
import { Icon } from '@/ui/Icon'

interface AgentEditorAdvancedProps {
	draft: ManagedAgent
	onUpdate: (patch: Partial<ManagedAgent>) => void
	onSetExecutor: (executor: StepExecutor) => void
	onSetMcpServers: (value: string) => void
	onSetToolDeny: (value: string) => void
	onSetToolAllow: (value: string) => void
}

/** Collapsible advanced block of the agent editor: reasoning, executor, Linear
 *  context, and MCP/tool policy. Owns its own open/closed state. */
export function AgentEditorAdvanced({
	draft,
	onUpdate,
	onSetExecutor,
	onSetMcpServers,
	onSetToolDeny,
	onSetToolAllow
}: AgentEditorAdvancedProps) {
	const [open, setOpen] = useState(false)

	return (
		<div className="flex flex-col gap-3 rounded-[8px] border border-(--border-faint) p-3">
			<button
				type="button"
				className="flex items-center gap-2 text-[12px] text-fg-dim hover:text-fg"
				aria-expanded={open}
				onClick={() => setOpen((prev) => !prev)}
			>
				<Icon name={open ? 'chevDown' : 'chev'} size={14} className="ic" />
				Advanced
			</button>
			{open ? (
				<div className="flex flex-col gap-3">
					<div className="grid grid-cols-2 gap-3">
						<SkillEditorField label="Reasoning">
							<MenuSelect
								ariaLabel="Reasoning"
								value={draft.default_reasoning}
								options={reasoningOptionsFor(draft.provider)}
								labels={REASONING_LABEL}
								onChange={(value) => onUpdate({ default_reasoning: value })}
							/>
						</SkillEditorField>
						<SkillEditorField label="Executor">
							<MenuSelect
								ariaLabel="Executor"
								value={agentExecutor(draft)}
								options={executorOptionsFor(draft.provider)}
								labels={EXECUTOR_LABEL}
								onChange={onSetExecutor}
							/>
						</SkillEditorField>
						<SkillEditorField label="Linear context">
							<MenuSelect
								ariaLabel="Linear context"
								value={draft.linear_context}
								options={LINEAR_CONTEXT_OPTIONS}
								labels={LINEAR_CONTEXT_LABEL}
								onChange={(value) => onUpdate({ linear_context: value })}
							/>
						</SkillEditorField>
					</div>
					<label className="flex flex-col gap-1">
						<span className="text-[12px] text-fg-dim">MCP servers</span>
						<input
							className="rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
							value={draft.mcp_policy.servers.join(', ')}
							placeholder="comma, separated, names"
							aria-label="MCP servers"
							onChange={(event) => onSetMcpServers(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-1">
						<span className="text-[12px] text-fg-dim">Tool deny</span>
						<input
							className="rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
							value={draft.tool_policy.deny?.join(', ') ?? ''}
							placeholder="comma, separated, tools"
							aria-label="Tool deny list"
							onChange={(event) => onSetToolDeny(event.target.value)}
						/>
					</label>
					<label className="flex flex-col gap-1">
						<span className="text-[12px] text-fg-dim">Tool allow</span>
						<input
							className="rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
							value={draft.tool_policy.allow?.join(', ') ?? ''}
							placeholder="comma, separated, tools"
							aria-label="Tool allow list"
							onChange={(event) => onSetToolAllow(event.target.value)}
						/>
					</label>
				</div>
			) : null}
		</div>
	)
}
