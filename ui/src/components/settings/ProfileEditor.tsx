import { StepListEditor } from '@/components/launch/StepListEditor'
import { ConfigSelect } from '@/components/settings/ConfigSelect'
import { useAgents } from '@/hooks/useAgents'
import { PROFILE_KIND_LABEL, PROFILE_KIND_OPTIONS } from '@/lib/launchConfigOptions'
import {
	addStep as addStepTo,
	applySkillToStep as applySkillToStepIn,
	moveStep as moveStepIn,
	removeStep as removeStepIn,
	setStepAgent as setStepAgentIn,
	setStepProvider as setStepProviderIn,
	updateStep as updateStepIn
} from '@/lib/stepReducer'
import type { Agent, AgentProvider, LaunchProfile, ProfileKind, ProfileStep, SkillDefinition } from '@/types'
import { Toggle } from '@/ui/Toggle'

interface ProfileEditorProps {
	draft: LaunchProfile
	skills: SkillDefinition[]
	skillsLoading?: boolean
	onChange: (draft: LaunchProfile) => void
}

export function ProfileEditor({ draft, skills, skillsLoading = false, onChange }: ProfileEditorProps) {
	const setSteps = (steps: ProfileStep[]) => onChange({ ...draft, steps })
	const agents = useAgents().data ?? []

	return (
		<div className="flex flex-col gap-4">
			<label className="flex flex-col gap-1">
				<span className="text-[12px] text-fg-dim">Name</span>
				<input
					value={draft.name}
					onChange={(event) => onChange({ ...draft, name: event.target.value })}
					placeholder="My profile"
					aria-label="Profile name"
					className="rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
				/>
			</label>
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex items-center gap-2">
					<span className="text-[12px] text-fg-dim">Kind</span>
					<ConfigSelect<ProfileKind>
						ariaLabel="Profile kind"
						value={draft.kind}
						options={PROFILE_KIND_OPTIONS}
						labels={PROFILE_KIND_LABEL}
						onChange={(kind) => onChange({ ...draft, kind })}
					/>
				</div>
				<Toggle
					checked={draft.is_default}
					ariaLabel="Default profile"
					label="Default"
					onChange={(is_default) => onChange({ ...draft, is_default })}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<span className="text-[12px] text-fg-dim">Steps</span>
				<StepListEditor
					steps={draft.steps}
					skills={skills}
					agents={agents}
					skillsLoading={skillsLoading}
					onUpdateStep={(ordering, patch) => setSteps(updateStepIn(draft.steps, ordering, patch))}
					onMoveStep={(ordering, direction) =>
						setSteps(moveStepIn(draft.steps, ordering, direction))
					}
					onRemoveStep={(ordering) => setSteps(removeStepIn(draft.steps, ordering))}
					onAddStep={() => setSteps(addStepTo(draft.steps))}
					onApplySkill={(ordering, skill) =>
						setSteps(applySkillToStepIn(draft.steps, ordering, skill))
					}
					onSetProvider={(ordering, provider: AgentProvider) =>
						setSteps(setStepProviderIn(draft.steps, ordering, provider))
					}
					onSetStepAgent={(ordering, agent: Agent | null) =>
						setSteps(setStepAgentIn(draft.steps, ordering, agent))
					}
				/>
			</div>
		</div>
	)
}
