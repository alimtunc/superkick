import type { FailureClassification } from '@/types'
import { describe, expect, it } from 'vitest'

import { getDisposition, getFailureCopy } from '../failureClassification'

const NEEDS_HUMAN: FailureClassification[] = [
	{ kind: 'missing_marker' },
	{ kind: 'malformed_marker', detail: 'expected `{`, found `x`' },
	{ kind: 'agent_reported', status: 'needs_human', summary: 'stuck on auth' },
	{ kind: 'auth_required', provider: 'claude' },
	{ kind: 'quota_exceeded', provider: 'claude', reset_at: '3:42pm' },
	{ kind: 'quota_exceeded', provider: 'codex', reset_at: null },
	{ kind: 'timeout', after: 1_800_000 },
	{ kind: 'no_diff' },
	{ kind: 'tests_failed', summary: '3 failures in fooctl::tests' },
	{ kind: 'agent_non_zero_exit', exit_code: 137, role: 'implementer' }
]

const FAILED: FailureClassification[] = [
	{ kind: 'cli_missing', binary: 'claude', install_hint: 'brew install anthropics/cli/claude' },
	{ kind: 'spawn_error', detail: 'permission denied' },
	{ kind: 'agent_reported', status: 'failed', summary: 'core dumped' }
]

describe('getFailureCopy', () => {
	it.each([...NEEDS_HUMAN, ...FAILED])('produces non-empty copy for $kind', (classification) => {
		const copy = getFailureCopy(classification)
		expect(copy.headline.trim()).not.toBe('')
		expect(copy.hint.trim()).not.toBe('')
	})

	it('inlines the provider label for auth + quota variants', () => {
		expect(getFailureCopy({ kind: 'auth_required', provider: 'claude' }).headline).toContain('Claude')
		expect(getFailureCopy({ kind: 'auth_required', provider: 'codex' }).headline).toContain('Codex')
		expect(
			getFailureCopy({ kind: 'quota_exceeded', provider: 'codex', reset_at: null }).headline
		).toContain('Codex')
	})

	it('mentions the reset_at wall-clock when the provider supplies one', () => {
		const withReset = getFailureCopy({ kind: 'quota_exceeded', provider: 'claude', reset_at: '3:42pm' })
		const withoutReset = getFailureCopy({ kind: 'quota_exceeded', provider: 'claude', reset_at: null })
		expect(withReset.hint).toContain('3:42pm')
		expect(withoutReset.hint).not.toContain('3:42pm')
	})

	it('exposes install_hint as a structured detail for cli_missing', () => {
		const copy = getFailureCopy({
			kind: 'cli_missing',
			binary: 'claude',
			install_hint: 'brew install anthropics/cli/claude'
		})
		expect(copy.detail).toBe('brew install anthropics/cli/claude')
	})

	it('exposes the malformed-marker detail without leaking it into the hint', () => {
		const copy = getFailureCopy({ kind: 'malformed_marker', detail: 'expected `{`, found `x`' })
		expect(copy.detail).toBe('expected `{`, found `x`')
		expect(copy.hint).not.toContain('expected `{`')
	})

	it('surfaces the agent-reported summary in both hint and detail (when non-empty)', () => {
		const copy = getFailureCopy({
			kind: 'agent_reported',
			status: 'needs_human',
			summary: 'awaiting choice'
		})
		expect(copy.hint).toContain('awaiting choice')
		expect(copy.detail).toBe('awaiting choice')
	})

	it('falls back to a generic hint when agent_reported summary is empty', () => {
		const copy = getFailureCopy({ kind: 'agent_reported', status: 'failed', summary: '   ' })
		expect(copy.hint).toMatch(/terminal/i)
		expect(copy.detail).toBeUndefined()
	})

	it('formats sub-second timeouts in milliseconds, longer ones in seconds, multi-minute in minutes', () => {
		expect(getFailureCopy({ kind: 'timeout', after: 500 }).hint).toContain('500ms')
		expect(getFailureCopy({ kind: 'timeout', after: 45_000 }).hint).toContain('45s')
		expect(getFailureCopy({ kind: 'timeout', after: 1_800_000 }).hint).toContain('30m')
	})

	it('includes role + exit_code for agent_non_zero_exit', () => {
		const copy = getFailureCopy({ kind: 'agent_non_zero_exit', exit_code: 137, role: 'implementer' })
		expect(copy.headline).toContain('implementer')
		expect(copy.headline).toContain('137')
	})
})

describe('getDisposition', () => {
	it.each(NEEDS_HUMAN)('routes $kind to needs_human', (classification) => {
		expect(getDisposition(classification)).toBe('needs_human')
	})

	it.each(FAILED)('routes $kind to failed', (classification) => {
		expect(getDisposition(classification)).toBe('failed')
	})
})
