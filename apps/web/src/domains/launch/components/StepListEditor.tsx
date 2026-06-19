import { MenuSelect } from '@/components/composites/menu-select'
import { Button, Icon, Pill, Toggle } from '@/components/primitives'
import { AgentPicker } from '@/domains/launch/components/AgentPicker'
import { LaunchStepSkillPicker } from '@/domains/launch/components/LaunchStepSkillPicker'
import { providerLabel } from '@/lib/domain'
import { stepKindFromSkillRef } from '@/lib/launch/stepKind'
import {
	EXECUTOR_LABEL,
	LAUNCH_PROVIDER_OPTIONS,
	REASONING_LABEL,
	executorOptionsFor,
	reasoningOptionsFor
} from '@/lib/launchConfigOptions'
import { stepRefIssues } from '@/lib/profiles'
import type { Agent, AgentProvider, ProfileStep, SkillDefinition } from '@/types'

interface StepListEditorProps {
	steps: ProfileStep[]
	skills: SkillDefinition[]
	agents: Agent[]
	skillsLoading?: boolean
	onUpdateStep: (ordering: number, patch: Partial<ProfileStep>) => void
	onMoveStep: (ordering: number, direction: 'up' | 'down') => void
	onRemoveStep: (ordering: number) => void
	onAddStep: () => void
	onApplySkill: (ordering: number, skill: SkillDefinition) => void
	onSetProvider: (ordering: number, provider: AgentProvider) => void
	onSetStepAgent: (ordering: number, agent: Agent | null) => void
}

export function StepListEditor({
	steps,
	skills,
	agents,
	skillsLoading = false,
	onUpdateStep,
	onMoveStep,
	onRemoveStep,
	onAddStep,
	onApplySkill,
	onSetProvider,
	onSetStepAgent
}: StepListEditorProps) {
	const sorted = steps.toSorted((a, b) => a.ordering - b.ordering)
	const findAgent = (name: string): Agent | null => agents.find((a) => a.name === name) ?? null

	return (
		<div className="flex flex-col gap-2">
			{sorted.map((step, index) => {
				const issues = stepRefIssues(step, skills, agents)
				return (
					<div
						key={step.ordering}
						className="bg-bg flex flex-wrap items-center gap-2 rounded-[8px] border border-border px-3 py-2"
					>
						<div className="flex flex-col">
							<button
								type="button"
								aria-label={`Move ${step.label} up`}
								disabled={index === 0}
								className="text-fg-dim hover:text-fg disabled:opacity-30"
								onClick={() => onMoveStep(step.ordering, 'up')}
							>
								<Icon name="chevDown" size={12} className="ic rotate-180" />
							</button>
							<button
								type="button"
								aria-label={`Move ${step.label} down`}
								disabled={index === sorted.length - 1}
								className="text-fg-dim hover:text-fg disabled:opacity-30"
								onClick={() => onMoveStep(step.ordering, 'down')}
							>
								<Icon name="chevDown" size={12} className="ic" />
							</button>
						</div>
						<span className="w-5 text-[12px] text-fg-dim">{step.ordering}</span>
						<span className="min-w-0 flex-1 truncate text-[13px] text-fg">{step.label}</span>
						{issues.skillMissing ? (
							<Pill tone="warn" size="xs">
								skill missing
							</Pill>
						) : null}
						{issues.agentMissing ? (
							<Pill tone="warn" size="xs">
								agent missing
							</Pill>
						) : null}
						<LaunchStepSkillPicker
							ariaLabel={`${step.label} skill`}
							skillRef={step.skill_ref}
							skills={skills}
							disabled={skillsLoading}
							onSelect={(skill) => onApplySkill(step.ordering, skill)}
						/>
						<AgentPicker
							value={step.agent_ref ?? null}
							agents={agents}
							recommendedFor={stepKindFromSkillRef(step.skill_ref)}
							icon="agent"
							label="Agent"
							onChange={(name) => onSetStepAgent(step.ordering, findAgent(name))}
						/>
						{step.agent_ref ? (
							<button
								type="button"
								aria-label={`Clear ${step.label} agent`}
								className="text-fg-dim hover:text-fg"
								onClick={() => onSetStepAgent(step.ordering, null)}
							>
								<Icon name="x" size={13} className="ic" />
							</button>
						) : null}
						<MenuSelect
							ariaLabel={`${step.label} provider`}
							value={step.provider}
							options={LAUNCH_PROVIDER_OPTIONS}
							labels={providerLabel}
							onChange={(value) => onSetProvider(step.ordering, value)}
						/>
						<MenuSelect
							ariaLabel={`${step.label} executor`}
							value={step.executor}
							options={executorOptionsFor(step.provider)}
							labels={EXECUTOR_LABEL}
							onChange={(value) => onUpdateStep(step.ordering, { executor: value })}
						/>
						<MenuSelect
							ariaLabel={`${step.label} reasoning`}
							value={step.reasoning}
							options={reasoningOptionsFor(step.provider)}
							labels={REASONING_LABEL}
							onChange={(value) => onUpdateStep(step.ordering, { reasoning: value })}
						/>
						<Toggle
							checked={step.enabled}
							ariaLabel={`${step.label} enabled`}
							onChange={() => onUpdateStep(step.ordering, { enabled: !step.enabled })}
						/>
						<button
							type="button"
							aria-label={`Remove ${step.label}`}
							className="text-fg-dim hover:text-danger"
							onClick={() => onRemoveStep(step.ordering)}
						>
							<Icon name="x" size={13} className="ic" />
						</button>
					</div>
				)
			})}
			<div>
				<Button variant="outline" size="sm" onClick={() => onAddStep()}>
					Add step
				</Button>
			</div>
		</div>
	)
}
