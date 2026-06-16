import { Button, Icon, Toggle } from '@/components/primitives'
import { AgentPicker } from '@/domains/launch/components/AgentPicker'
import { stepKindFromSkillRef } from '@/lib/launch/stepKind'
import type { Agent, ProfileStep } from '@/types'

interface ComposerStepListProps {
	steps: ProfileStep[]
	agents: Agent[]
	onUpdateStep: (ordering: number, patch: Partial<ProfileStep>) => void
	onMoveStep: (ordering: number, direction: 'up' | 'down') => void
	onRemoveStep: (ordering: number) => void
	onAddStep: () => void
	onSetStepAgent: (ordering: number, agent: Agent | null) => void
}

/** The launch composer's step list: pick a configured agent per step, reorder,
 *  enable/disable. No per-launch config overrides — model/reasoning/tools/skills
 *  come from the selected agent (edit the agent to change them). */
export function ComposerStepList({
	steps,
	agents,
	onUpdateStep,
	onMoveStep,
	onRemoveStep,
	onAddStep,
	onSetStepAgent
}: ComposerStepListProps) {
	const sorted = steps.toSorted((a, b) => a.ordering - b.ordering)
	const findAgent = (name: string): Agent | null => agents.find((a) => a.name === name) ?? null

	return (
		<div className="flex flex-col gap-2">
			{sorted.map((step, index) => (
				<div
					key={step.ordering}
					className="bg-bg flex flex-wrap items-center gap-2 rounded-[8px] border border-border px-3 py-2"
				>
					<div className="flex flex-col">
						<button
							type="button"
							aria-label={`Move step ${step.ordering} up`}
							disabled={index === 0}
							className="text-fg-dim hover:text-fg disabled:opacity-30"
							onClick={() => onMoveStep(step.ordering, 'up')}
						>
							<Icon name="chevDown" size={12} className="ic rotate-180" />
						</button>
						<button
							type="button"
							aria-label={`Move step ${step.ordering} down`}
							disabled={index === sorted.length - 1}
							className="text-fg-dim hover:text-fg disabled:opacity-30"
							onClick={() => onMoveStep(step.ordering, 'down')}
						>
							<Icon name="chevDown" size={12} className="ic" />
						</button>
					</div>
					<span className="w-5 text-[12px] text-fg-dim">{step.ordering}</span>
					<AgentPicker
						value={step.agent_ref ?? null}
						agents={agents}
						recommendedFor={stepKindFromSkillRef(step.skill_ref)}
						icon="agent"
						label="Agent"
						onChange={(name) => onSetStepAgent(step.ordering, findAgent(name))}
					/>
					<span className="flex-1" />
					<Toggle
						checked={step.enabled}
						ariaLabel={`Step ${step.ordering} enabled`}
						onChange={() => onUpdateStep(step.ordering, { enabled: !step.enabled })}
					/>
					<button
						type="button"
						aria-label={`Remove step ${step.ordering}`}
						className="text-fg-dim hover:text-danger"
						onClick={() => onRemoveStep(step.ordering)}
					>
						<Icon name="x" size={13} className="ic" />
					</button>
				</div>
			))}
			<div>
				<Button variant="outline" size="sm" onClick={() => onAddStep()}>
					Add agent step
				</Button>
			</div>
		</div>
	)
}
