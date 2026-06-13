import type { LaunchTask, LaunchTaskStep } from '@/types'

// SUP-203 — retry/fix-forward act only on the step that parked the task at
// `needs_human` (mirrors the backend gate in `retry_needs_human_step`). Any
// other focused step exposes the takeover escape hatch only.
export function canRemediateStep(task: LaunchTask, step: LaunchTaskStep): boolean {
	return task.status === 'needs_human' && step.status === 'needs_human' && step.id === task.current_step_id
}

// Re-running a `claude_workflow` step re-spends paid Agent SDK credits; surface
// it so the operator opts in knowingly. The step keeps its executor on retry, so
// the billing label never silently escalates.
export function isPaidStep(step: LaunchTaskStep): boolean {
	return step.executor === 'claude_workflow'
}
