import type {
	CancelLaunchTaskResponse,
	CreateLaunchTaskRequest,
	LaunchTask,
	LaunchTaskStep,
	LaunchTaskWithSteps,
	RetryLaunchTaskResponse
} from '@/types'

import { BASE, throwGenericApiError } from './_shared'

export async function createLaunchTask(req: CreateLaunchTaskRequest): Promise<LaunchTaskWithSteps> {
	const res = await fetch(`${BASE}/launch-tasks`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	})
	if (!res.ok) await throwGenericApiError(res, 'create launch task failed')
	return res.json()
}

export async function listLaunchTasksForIssue(linearIssueId: string): Promise<LaunchTask[]> {
	const res = await fetch(`${BASE}/launch-tasks?linear_issue_id=${encodeURIComponent(linearIssueId)}`)
	if (!res.ok) await throwGenericApiError(res, 'list launch tasks failed')
	return res.json()
}

export async function fetchLaunchTaskSteps(taskId: string): Promise<LaunchTaskStep[]> {
	const res = await fetch(`${BASE}/launch-tasks/${encodeURIComponent(taskId)}/steps`)
	if (!res.ok) await throwGenericApiError(res, 'list launch task steps failed')
	return res.json()
}

export async function fetchLaunchTask(taskId: string): Promise<LaunchTask> {
	const res = await fetch(`${BASE}/launch-tasks/${encodeURIComponent(taskId)}`)
	if (!res.ok) await throwGenericApiError(res, 'fetch launch task failed')
	return res.json()
}

export async function cancelLaunchTask(taskId: string): Promise<CancelLaunchTaskResponse> {
	const res = await fetch(`${BASE}/launch-tasks/${encodeURIComponent(taskId)}/cancel`, {
		method: 'POST'
	})
	if (!res.ok) await throwGenericApiError(res, 'cancel launch task failed')
	return res.json()
}

export async function retryLaunchTask(taskId: string): Promise<RetryLaunchTaskResponse> {
	const res = await fetch(`${BASE}/launch-tasks/${encodeURIComponent(taskId)}/retry`, {
		method: 'POST'
	})
	if (!res.ok) await throwGenericApiError(res, 'retry launch task failed')
	return res.json()
}
