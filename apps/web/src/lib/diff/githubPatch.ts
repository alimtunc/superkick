import type { FileDiffStatus } from '@/types'

/**
 * GitHub's `patch` field is hunks-only (starts at `@@`); `@git-diff-view`
 * finds no hunks without the `diff --git` / `---` / `+++` preamble and
 * renders an empty diff. Run diffs come from `git diff` and already carry it.
 */
export function withGitDiffHeader(
	patch: string,
	path: string,
	oldPath: string | null | undefined,
	status: FileDiffStatus
): string {
	if (patch.startsWith('diff --git ')) return patch
	const from = oldPath ?? path
	const oldSide = status === 'added' ? '/dev/null' : `a/${from}`
	const newSide = status === 'deleted' ? '/dev/null' : `b/${path}`
	return `diff --git a/${from} b/${path}\n--- ${oldSide}\n+++ ${newSide}\n${patch}`
}
