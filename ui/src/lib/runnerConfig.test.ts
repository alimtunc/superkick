import {
	isRunnerFormDirty,
	restartConfirmDescription,
	setupCommandsToText,
	textToSetupCommands,
	toRunnerConfigUpdate,
	validateBaseBranch,
	validateRunnerForm,
	validateWorktreePrefix
} from '@/lib/runnerConfig'
import type { RunnerConfigResponse } from '@/types'
import { describe, expect, it } from 'vitest'

describe('validateWorktreePrefix', () => {
	it('accepts a typical prefix', () => {
		expect(validateWorktreePrefix('sup-run')).toBeNull()
	})

	it('accepts dots, underscores and digits in the middle', () => {
		expect(validateWorktreePrefix('a1._b')).toBeNull()
	})

	it('trims surrounding whitespace before validating', () => {
		expect(validateWorktreePrefix('  sup  ')).toBeNull()
	})

	it('rejects an empty value', () => {
		expect(validateWorktreePrefix('')).toBe('Worktree prefix is required')
	})

	it('rejects a whitespace-only value', () => {
		expect(validateWorktreePrefix('   ')).toBe('Worktree prefix is required')
	})

	it('accepts exactly 40 characters', () => {
		expect(validateWorktreePrefix('a'.repeat(40))).toBeNull()
	})

	it('rejects more than 40 characters', () => {
		expect(validateWorktreePrefix('a'.repeat(41))).toBe('Worktree prefix must be 40 characters or fewer')
	})

	it('rejects uppercase letters', () => {
		expect(validateWorktreePrefix('Sup')).toBe('Use only lowercase letters, digits, ".", "_" and "-"')
	})

	it('rejects slashes', () => {
		expect(validateWorktreePrefix('a/b')).toBe('Use only lowercase letters, digits, ".", "_" and "-"')
	})

	it('rejects a leading dot', () => {
		expect(validateWorktreePrefix('.sup')).toBe('Worktree prefix must not start or end with "." or "-"')
	})

	it('rejects a leading dash', () => {
		expect(validateWorktreePrefix('-sup')).toBe('Worktree prefix must not start or end with "." or "-"')
	})

	it('rejects a trailing dot', () => {
		expect(validateWorktreePrefix('sup.')).toBe('Worktree prefix must not start or end with "." or "-"')
	})

	it('rejects a trailing dash', () => {
		expect(validateWorktreePrefix('sup-')).toBe('Worktree prefix must not start or end with "." or "-"')
	})
})

describe('validateBaseBranch', () => {
	it('accepts a branch name', () => {
		expect(validateBaseBranch('main')).toBeNull()
	})

	it('rejects an empty value', () => {
		expect(validateBaseBranch('')).toBe('Base branch is required')
	})

	it('rejects a whitespace-only value', () => {
		expect(validateBaseBranch('  ')).toBe('Base branch is required')
	})
})

describe('validateRunnerForm', () => {
	it('reports both fields independently', () => {
		expect(validateRunnerForm('', 'main')).toEqual({
			worktreePrefix: 'Worktree prefix is required',
			baseBranch: null
		})
		expect(validateRunnerForm('sup', '')).toEqual({
			worktreePrefix: null,
			baseBranch: 'Base branch is required'
		})
	})
})

describe('setup command converters', () => {
	it('joins commands with newlines', () => {
		expect(setupCommandsToText(['pnpm install', 'just check'])).toBe('pnpm install\njust check')
	})

	it('splits text on newlines, trims, and drops empty lines', () => {
		expect(textToSetupCommands('  pnpm install  \n\n just check \n   \n')).toEqual([
			'pnpm install',
			'just check'
		])
	})

	it('round-trips an empty list', () => {
		expect(textToSetupCommands(setupCommandsToText([]))).toEqual([])
	})
})

describe('toRunnerConfigUpdate', () => {
	it('trims scalar fields and converts the commands text', () => {
		expect(toRunnerConfigUpdate(' sup ', ' main ', 'a\n\nb')).toEqual({
			worktree_prefix: 'sup',
			base_branch: 'main',
			setup_commands: ['a', 'b']
		})
	})
})

describe('isRunnerFormDirty', () => {
	const saved: RunnerConfigResponse = {
		worktree_prefix: 'sup',
		base_branch: 'main',
		setup_commands: ['pnpm install'],
		requires_restart: false
	}

	it('is pristine when the update matches the saved config', () => {
		expect(isRunnerFormDirty(saved, toRunnerConfigUpdate('sup', 'main', 'pnpm install'))).toBe(false)
	})

	it('is pristine for whitespace-only edits', () => {
		expect(isRunnerFormDirty(saved, toRunnerConfigUpdate(' sup ', 'main ', ' pnpm install \n'))).toBe(
			false
		)
	})

	it('is dirty when the prefix changes', () => {
		expect(isRunnerFormDirty(saved, toRunnerConfigUpdate('sup2', 'main', 'pnpm install'))).toBe(true)
	})

	it('is dirty when the base branch changes', () => {
		expect(isRunnerFormDirty(saved, toRunnerConfigUpdate('sup', 'develop', 'pnpm install'))).toBe(true)
	})

	it('is dirty when commands change', () => {
		expect(
			isRunnerFormDirty(saved, toRunnerConfigUpdate('sup', 'main', 'pnpm install\njust check'))
		).toBe(true)
	})
})

describe('restartConfirmDescription', () => {
	it('warns about an unknown number of runs when the check failed', () => {
		expect(restartConfirmDescription(null)).toBe(
			'Superkick could not check for active runs. Restarting the daemon kills any run in progress.'
		)
	})

	it('uses the singular for one run', () => {
		expect(restartConfirmDescription(1)).toBe('Restarting the daemon kills 1 active run.')
	})

	it('uses the plural for several runs', () => {
		expect(restartConfirmDescription(3)).toBe('Restarting the daemon kills 3 active runs.')
	})
})
