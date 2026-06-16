import { useState } from 'react'

import { AgentAvatarBadge } from '@/components/agents/AgentAvatarBadge'
import { AgentEditor } from '@/components/agents/AgentEditor'
import { DetailField } from '@/components/agents/DetailField'
import { SkillChip } from '@/components/agents/SkillChip'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Pill } from '@/components/ui/pill'
import { ErrorState } from '@/components/ui/state-error'
import { LoadingState } from '@/components/ui/state-loading'
import { useAgentMutations, useManagedAgent } from '@/hooks/useAgents'
import { useSkills } from '@/hooks/useSkills'
import {
	agentDeleteDescription,
	agentExecutor,
	isBuiltinAgent,
	policyServers,
	skillLabel,
	toolList
} from '@/lib/agents'
import { providerLabel } from '@/lib/domain'
import { EXECUTOR_LABEL, REASONING_LABEL } from '@/lib/launchConfigOptions'
import { LINEAR_CONTEXT_LABEL, type ManagedAgent } from '@/types'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

interface AgentCockpitProps {
	name: string
}

export function AgentCockpit({ name }: AgentCockpitProps) {
	const { agent, isLoading, error } = useManagedAgent(name)
	const { updateAgent, deleteAgent, restoreAgent, isMutating } = useAgentMutations()
	const { skills } = useSkills()
	const navigate = useNavigate()
	const [editOpen, setEditOpen] = useState(false)
	const [confirmDelete, setConfirmDelete] = useState(false)

	if (isLoading) return <LoadingState rows={5} />
	if (error) return <ErrorState message={error} density="compact" />
	if (!agent) return <ErrorState message="Agent not found" density="compact" />

	async function handleSave(next: ManagedAgent) {
		try {
			await updateAgent({ name, agent: next })
			setEditOpen(false)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to save agent')
		}
	}

	async function handleDelete() {
		try {
			await deleteAgent(name)
			await navigate({ to: '/agents' })
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to delete agent')
		}
	}

	async function handleRestore() {
		try {
			await restoreAgent(name)
			toast.success('Agent restored to default')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to restore agent')
		}
	}

	const builtin = isBuiltinAgent(agent)

	return (
		<>
			<div className="flex flex-col gap-5">
				<div className="flex items-center gap-3">
					<AgentAvatarBadge avatar={agent.avatar} name={agent.name} size={32} />
					<div className="flex min-w-0 flex-col">
						<h2 className="text-[16px] font-semibold text-fg">{agent.name}</h2>
						{agent.description ? (
							<span className="text-[12px] text-fg-dim">{agent.description}</span>
						) : null}
					</div>
					<Pill tone={agent.origin === 'custom' ? 'accent' : 'neutral'}>{agent.origin}</Pill>
					<Pill tone={agent.enabled ? 'accent' : 'neutral'}>
						{agent.enabled ? 'enabled' : 'disabled'}
					</Pill>
					<span className="spacer flex-1" />
					<Button size="sm" disabled={isMutating} onClick={() => setEditOpen(true)}>
						Edit
					</Button>
					{builtin ? (
						<Button variant="ghost" size="sm" disabled={isMutating} onClick={handleRestore}>
							Restore default
						</Button>
					) : null}
					<Button
						variant="ghost"
						size="sm"
						disabled={isMutating}
						onClick={() => setConfirmDelete(true)}
					>
						Delete
					</Button>
				</div>

				<section className="rounded-[8px] border border-(--border-faint) p-4">
					<div className="grid grid-cols-2 gap-4 md:grid-cols-3">
						<DetailField label="Provider" value={providerLabel[agent.provider]} />
						<DetailField label="Role" value={agent.role ?? '—'} />
						<DetailField label="Model" value={agent.model ?? 'provider default'} />
						<DetailField label="Reasoning" value={REASONING_LABEL[agent.default_reasoning]} />
						<DetailField label="Executor" value={EXECUTOR_LABEL[agentExecutor(agent)]} />
						<DetailField
							label="Linear context"
							value={LINEAR_CONTEXT_LABEL[agent.linear_context]}
						/>
					</div>
				</section>

				<section className="flex flex-col gap-2 rounded-[8px] border border-(--border-faint) p-4">
					<span className="text-[12px] text-fg-dim">Instructions</span>
					{agent.system_prompt ? (
						<pre className="overflow-x-auto rounded-[6px] bg-raised p-3 font-mono text-[12px] text-fg">
							{agent.system_prompt}
						</pre>
					) : (
						<span className="text-[13px] text-fg-dim">
							None — the step prompt is the single source of behaviour.
						</span>
					)}
				</section>

				<section className="flex flex-col gap-2 rounded-[8px] border border-(--border-faint) p-4">
					<span className="text-[12px] text-fg-dim">Skills</span>
					{agent.skills.length > 0 ? (
						<div className="flex flex-wrap gap-1.5">
							{agent.skills.map((id) => (
								<SkillChip key={id} label={skillLabel(skills, id)} />
							))}
						</div>
					) : (
						<span className="text-[13px] text-fg-dim">
							None attached — this agent materialises no skills at launch.
						</span>
					)}
				</section>

				<section className="rounded-[8px] border border-(--border-faint) p-4">
					<div className="grid grid-cols-2 gap-4 md:grid-cols-3">
						<DetailField label="MCP servers" value={policyServers(agent)} />
						<DetailField label="Tool allow" value={toolList(agent.tool_policy.allow)} />
						<DetailField label="Tool deny" value={toolList(agent.tool_policy.deny)} />
					</div>
				</section>

				{editOpen ? (
					<AgentEditor
						open={editOpen}
						seed={agent}
						mode="edit"
						busy={isMutating}
						onOpenChange={(open) => {
							if (!open) setEditOpen(false)
						}}
						onSubmit={handleSave}
					/>
				) : null}
			</div>

			<ConfirmDialog
				open={confirmDelete}
				onOpenChange={setConfirmDelete}
				title="Delete agent?"
				description={agentDeleteDescription(agent.name, builtin)}
				confirmLabel="Delete"
				destructive
				busy={isMutating}
				onConfirm={() => {
					setConfirmDelete(false)
					handleDelete()
				}}
			/>
		</>
	)
}
