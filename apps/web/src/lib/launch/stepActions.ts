import type { LaunchTask, LaunchTaskStep } from '@/types'

// Mirrors the backend gate in `retry_needs_human_step`.
export function canRemediateStep(task: LaunchTask, step: LaunchTaskStep): boolean {
	return task.status === 'needs_human' && step.status === 'needs_human' && step.id === task.current_step_id
}
