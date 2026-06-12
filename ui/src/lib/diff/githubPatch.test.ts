import { withGitDiffHeader } from '@/lib/diff/githubPatch'
import { describe, expect, it } from 'vitest'

const HUNK = '@@ -1,2 +1,3 @@\n line\n+added\n line2'

describe('withGitDiffHeader', () => {
	it('prepends a git header to a hunks-only patch', () => {
		expect(withGitDiffHeader(HUNK, 'src/foo.ts', null, 'modified')).toBe(
			`diff --git a/src/foo.ts b/src/foo.ts\n--- a/src/foo.ts\n+++ b/src/foo.ts\n${HUNK}`
		)
	})

	it('uses /dev/null as the old side for added files', () => {
		expect(withGitDiffHeader(HUNK, 'new.ts', null, 'added')).toBe(
			`diff --git a/new.ts b/new.ts\n--- /dev/null\n+++ b/new.ts\n${HUNK}`
		)
	})

	it('uses /dev/null as the new side for deleted files', () => {
		expect(withGitDiffHeader(HUNK, 'gone.ts', null, 'deleted')).toBe(
			`diff --git a/gone.ts b/gone.ts\n--- a/gone.ts\n+++ /dev/null\n${HUNK}`
		)
	})

	it('uses the old path on the old side for renamed files', () => {
		expect(withGitDiffHeader(HUNK, 'to.ts', 'from.ts', 'renamed')).toBe(
			`diff --git a/from.ts b/to.ts\n--- a/from.ts\n+++ b/to.ts\n${HUNK}`
		)
	})

	it('leaves patches that already carry a git header untouched', () => {
		const full = `diff --git a/x b/x\n--- a/x\n+++ b/x\n${HUNK}`
		expect(withGitDiffHeader(full, 'x', null, 'modified')).toBe(full)
	})
})
