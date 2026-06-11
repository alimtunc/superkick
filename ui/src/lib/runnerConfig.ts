import type { RunnerConfigResponse, RunnerConfigUpdate, RunnerValidationErrors } from '@/types'

const WORKTREE_PREFIX_PATTERN = /^[a-z0-9._-]+$/
const WORKTREE_PREFIX_MAX_LENGTH = 40

export function validateWorktreePrefix(value: string): string | null {
	const trimmed = value.trim()
	if (trimmed.length === 0) return 'Worktree prefix is required'
	if (trimmed.length > WORKTREE_PREFIX_MAX_LENGTH) {
		return `Worktree prefix must be ${WORKTREE_PREFIX_MAX_LENGTH} characters or fewer`
	}
	if (!WORKTREE_PREFIX_PATTERN.test(trimmed)) {
		return 'Use only lowercase letters, digits, ".", "_" and "-"'
	}
	if (/^[.-]/.test(trimmed) || /[.-]$/.test(trimmed)) {
		return 'Worktree prefix must not start or end with "." or "-"'
	}
	return null
}

export function validateBaseBranch(value: string): string | null {
	return value.trim().length === 0 ? 'Base branch is required' : null
}

export function validateRunnerForm(worktreePrefix: string, baseBranch: string): RunnerValidationErrors {
	return {
		worktreePrefix: validateWorktreePrefix(worktreePrefix),
		baseBranch: validateBaseBranch(baseBranch)
	}
}

export function setupCommandsToText(commands: string[]): string {
	return commands.join('\n')
}

export function textToSetupCommands(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
}

export function toRunnerConfigUpdate(
	worktreePrefix: string,
	baseBranch: string,
	setupCommandsText: string
): RunnerConfigUpdate {
	return {
		worktree_prefix: worktreePrefix.trim(),
		base_branch: baseBranch.trim(),
		setup_commands: textToSetupCommands(setupCommandsText)
	}
}

export function isRunnerFormDirty(saved: RunnerConfigResponse, update: RunnerConfigUpdate): boolean {
	return (
		update.worktree_prefix !== saved.worktree_prefix ||
		update.base_branch !== saved.base_branch ||
		setupCommandsToText(update.setup_commands) !== setupCommandsToText(saved.setup_commands)
	)
}

export function restartConfirmDescription(activeRuns: number | null): string {
	if (activeRuns === null) {
		return 'Superkick could not check for active runs. Restarting the daemon kills any run in progress.'
	}
	if (activeRuns === 1) return 'Restarting the daemon kills 1 active run.'
	return `Restarting the daemon kills ${activeRuns} active runs.`
}
