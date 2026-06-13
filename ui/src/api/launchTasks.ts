import type {
	CancelLaunchTaskResponse,
	CreateInterventionRequest,
	CreateLaunchTaskRequest,
	LaunchTask,
	LaunchTaskIntervention,
	LaunchTaskStep,
	LaunchTaskWithSteps,
	RetryLaunchTaskResponse,
	RetryPath
} from '@/types'

import { getJson, postJson, postJsonChecked } from './_shared'

export async function createLaunchTask(req: CreateLaunchTaskRequest): Promise<LaunchTaskWithSteps> {
	return postJsonChecked('/launch-tasks', 'create launch task failed', req)
}

export async function listLaunchTasksForIssue(linearIssueId: string): Promise<LaunchTask[]> {
	return getJson(
		`/launch-tasks?linear_issue_id=${encodeURIComponent(linearIssueId)}`,
		'list launch tasks failed'
	)
}

export async function fetchLaunchTaskSteps(taskId: string): Promise<LaunchTaskStep[]> {
	return getJson(`/launch-tasks/${encodeURIComponent(taskId)}/steps`, 'list launch task steps failed')
}

export async function fetchLaunchTask(taskId: string): Promise<LaunchTask> {
	return getJson(`/launch-tasks/${encodeURIComponent(taskId)}`, 'fetch launch task failed')
}

export async function cancelLaunchTask(taskId: string): Promise<CancelLaunchTaskResponse> {
	return postJson(`/launch-tasks/${encodeURIComponent(taskId)}/cancel`, 'cancel launch task failed')
}

export async function retryLaunchTask(taskId: string, path: RetryPath): Promise<RetryLaunchTaskResponse> {
	return postJson(
		`/launch-tasks/${encodeURIComponent(taskId)}/retry?path=${path}`,
		'retry launch task failed'
	)
}

export async function listLaunchTaskInterventions(taskId: string): Promise<LaunchTaskIntervention[]> {
	return getJson(
		`/launch-tasks/${encodeURIComponent(taskId)}/interventions`,
		'list launch task interventions failed'
	)
}

export async function createLaunchTaskIntervention(
	taskId: string,
	req: CreateInterventionRequest
): Promise<LaunchTaskIntervention> {
	return postJson(
		`/launch-tasks/${encodeURIComponent(taskId)}/interventions`,
		'create launch task intervention failed',
		req
	)
}
