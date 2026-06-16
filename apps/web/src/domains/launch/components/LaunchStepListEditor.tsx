import { ComposerStepList } from '@/domains/launch/components/ComposerStepList'
import { useAgents } from '@/hooks/useAgents'
import { useLaunchComposerState } from '@/stores/launchComposerState'

export function LaunchStepListEditor() {
	const steps = useLaunchComposerState((state) => state.steps)
	const moveStep = useLaunchComposerState((state) => state.moveStep)
	const removeStep = useLaunchComposerState((state) => state.removeStep)
	const updateStep = useLaunchComposerState((state) => state.updateStep)
	const setStepAgent = useLaunchComposerState((state) => state.setStepAgent)
	const addStep = useLaunchComposerState((state) => state.addStep)
	const agents = useAgents().data ?? []

	return (
		<ComposerStepList
			steps={steps}
			agents={agents}
			onUpdateStep={updateStep}
			onMoveStep={moveStep}
			onRemoveStep={removeStep}
			onAddStep={addStep}
			onSetStepAgent={setStepAgent}
		/>
	)
}
