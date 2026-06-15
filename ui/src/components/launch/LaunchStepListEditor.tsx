import { StepListEditor } from '@/components/launch/StepListEditor'
import { useAgents } from '@/hooks/useAgents'
import { useLaunchComposerState } from '@/stores/launchComposerState'
import type { SkillDefinition } from '@/types'

interface LaunchStepListEditorProps {
	skills: SkillDefinition[]
	skillsLoading?: boolean
}

export function LaunchStepListEditor({ skills, skillsLoading = false }: LaunchStepListEditorProps) {
	const steps = useLaunchComposerState((state) => state.steps)
	const moveStep = useLaunchComposerState((state) => state.moveStep)
	const removeStep = useLaunchComposerState((state) => state.removeStep)
	const updateStep = useLaunchComposerState((state) => state.updateStep)
	const setStepProvider = useLaunchComposerState((state) => state.setStepProvider)
	const setStepAgent = useLaunchComposerState((state) => state.setStepAgent)
	const applySkillToStep = useLaunchComposerState((state) => state.applySkillToStep)
	const addStep = useLaunchComposerState((state) => state.addStep)
	const agents = useAgents().data ?? []

	return (
		<StepListEditor
			steps={steps}
			skills={skills}
			agents={agents}
			skillsLoading={skillsLoading}
			onUpdateStep={updateStep}
			onMoveStep={moveStep}
			onRemoveStep={removeStep}
			onAddStep={addStep}
			onApplySkill={applySkillToStep}
			onSetProvider={setStepProvider}
			onSetStepAgent={setStepAgent}
		/>
	)
}
