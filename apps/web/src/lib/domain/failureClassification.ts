import type { FailureClassification, FailureDisposition } from '@/types'

import { providerLabel } from './displayLabels'

export interface FailureCopy {
	headline: string
	hint: string
	detail?: string
}

export function getFailureCopy(classification: FailureClassification, autoResumeCount = 0): FailureCopy {
	switch (classification.kind) {
		case 'missing_marker':
			return {
				headline: "Step didn't report completion",
				hint: 'Open the run terminal to review the agent output, then retry.'
			}
		case 'malformed_marker':
			return {
				headline: 'Step completion marker was malformed',
				hint: 'Review the agent output for the bad payload, then retry.',
				detail: classification.detail
			}
		case 'agent_reported': {
			const summary = classification.summary.trim()
			if (classification.status === 'failed') {
				return {
					headline: 'Agent reported failure',
					hint: summary || 'Review the run terminal — the agent did not retry on its own.',
					detail: summary || undefined
				}
			}
			return {
				headline: 'Agent stopped and asked for help',
				hint: summary || 'Open the run terminal to see what the agent is blocked on.',
				detail: summary || undefined
			}
		}
		case 'auth_required':
			return {
				headline: `Sign in to ${providerLabel[classification.provider]} required`,
				hint: `Authenticate ${providerLabel[classification.provider]} in the runner terminal, then retry.`
			}
		case 'quota_exceeded':
			return {
				headline: `${providerLabel[classification.provider]} quota exhausted`,
				hint: classification.reset_at
					? `Quota resets at ${classification.reset_at}. Retry after, or switch to another agent.`
					: `Wait for the provider quota to reset, or switch to another agent.`
			}
		case 'cli_missing':
			return {
				headline: `${classification.binary} CLI not found on PATH`,
				hint: 'Install the CLI locally and re-launch the task — retrying without the binary will not help.',
				detail: classification.install_hint
			}
		case 'timeout':
			return {
				headline: 'Step exceeded its wall-clock budget',
				hint: timeoutHint(classification.after, autoResumeCount)
			}
		case 'no_diff':
			return {
				headline: 'Implement step produced no diff',
				hint: 'Open the run terminal — the agent may have stopped before writing any files.'
			}
		case 'tests_failed':
			return {
				headline: 'Tests reported failures',
				hint: 'Open the run terminal to inspect the failing suite, then retry once the tests are green.',
				detail: classification.summary.trim() || undefined
			}
		case 'spawn_error':
			return {
				headline: 'Could not spawn agent process',
				hint: 'Check the runner logs — this is terminal. Re-launch the task once the cause is fixed.',
				detail: classification.detail
			}
		case 'agent_non_zero_exit':
			return {
				headline: `${classification.role} agent exited with code ${classification.exit_code}`,
				hint: 'Open the run terminal to see what went wrong, then retry.'
			}
	}
}

// Mirror of `superkick_core::FailureClassification::disposition` — keep in sync with step_result.rs.
export function getDisposition(classification: FailureClassification): FailureDisposition {
	switch (classification.kind) {
		case 'cli_missing':
		case 'spawn_error':
			return 'failed'
		case 'agent_reported':
			return classification.status === 'failed' ? 'failed' : 'needs_human'
		case 'missing_marker':
		case 'malformed_marker':
		case 'auth_required':
		case 'quota_exceeded':
		case 'timeout':
		case 'no_diff':
		case 'tests_failed':
		case 'agent_non_zero_exit':
			return 'needs_human'
	}
}

function timeoutHint(afterMs: number, autoResumeCount: number): string {
	const ran = formatTimeoutSeconds(afterMs)
	if (autoResumeCount > 0) {
		return `Ran for ${ran} per segment. Auto-resume stopped after ${autoResumeCount}× without finishing — retry to resume the session, raise the agent's timeout, or split the step.`
	}
	return `Ran for ${ran} before timing out. Raise the agent's timeout or split the step, then retry.`
}

function formatTimeoutSeconds(ms: number): string {
	if (ms < 1_000) return `${ms}ms`
	const seconds = Math.round(ms / 1000)
	if (seconds < 90) return `${seconds}s`
	const minutes = Math.round(seconds / 60)
	return `${minutes}m`
}
