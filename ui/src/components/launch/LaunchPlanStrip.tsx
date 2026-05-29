import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import { cn } from '@/lib/utils'
import type { LaunchTask, LaunchTaskStep } from '@/types'
import { Icon } from '@/ui/Icon'

interface LaunchPlanStripProps {
	task: LaunchTask
	steps: readonly LaunchTaskStep[]
	variant?: 'chips' | 'stepper'
}

type PhaseState = 'done' | 'active' | 'pending' | 'paused'

function phaseStateFor(step: LaunchTaskStep, isCurrent: boolean): PhaseState {
	if (step.status === 'completed') return 'done'
	if (step.status === 'needs_human') return 'paused'
	if (isCurrent || step.status === 'running') return 'active'
	return 'pending'
}

function barFillFor(state: PhaseState, nextState: PhaseState): 'filled' | 'partial' | '' {
	if (state === 'done' && nextState === 'done') return 'filled'
	if (state === 'done') return 'partial'
	return ''
}

export function LaunchPlanStrip({ task, steps }: LaunchPlanStripProps) {
	const done = steps.filter((s) => s.status === 'completed').length
	const total = steps.length

	const phaseStates = steps.map((step) => phaseStateFor(step, step.id === task.current_step_id))

	return (
		<div className="phases sticky top-0 z-10 bg-surface">
			{steps.map((step, index) => {
				const state = phaseStates[index]
				const nextState = phaseStates[index + 1] ?? state
				const fill = barFillFor(state, nextState)
				return (
					<div key={step.id} className={cn('phase', `phase--${state}`)}>
						<span className="phase__dot">
							{state === 'done' ? <Icon name="check" size={10} className="ic" /> : null}
						</span>
						<span className="phase__label">{LAUNCH_STEP_KIND_LABEL[step.step_kind]}</span>
						<span className={cn('phase__bar', fill)} aria-hidden="true" />
					</div>
				)
			})}
			<span className="sr-only">
				{done} of {total} done
			</span>
		</div>
	)
}
