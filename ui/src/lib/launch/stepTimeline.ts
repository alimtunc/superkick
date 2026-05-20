import type { LaunchTask, LaunchTaskStep } from '@/types'

export function isStepActive(step: LaunchTaskStep, task: LaunchTask): boolean {
	return step.id === task.current_step_id && step.status === 'running'
}
