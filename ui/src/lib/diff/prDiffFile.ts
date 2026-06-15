import type { FileDiff, FileDiffStatus, IssuePrDiffFile, IssuePrDiffFileStatus } from '@/types'

import { withGitDiffHeader } from './githubPatch'

// GitHub PR diff file (issue- or repo-anchored) → the renderer's `FileDiff`.
// GitHub `patch` is hunks-only, so the `diff --git` header is prepended.
export function toFileDiff(file: IssuePrDiffFile): FileDiff {
	const status = toFileDiffStatus(file.status)
	return {
		path: file.path,
		status,
		oldPath: file.old_path,
		additions: file.additions,
		deletions: file.deletions,
		binary: false,
		truncated: false,
		patch: file.patch ? withGitDiffHeader(file.patch, file.path, file.old_path, status) : file.patch
	}
}

export function toFileDiffStatus(status: IssuePrDiffFileStatus): FileDiffStatus {
	switch (status) {
		case 'added':
			return 'added'
		case 'removed':
			return 'deleted'
		case 'renamed':
			return 'renamed'
		case 'modified':
		case 'changed':
		case 'unchanged':
			return 'modified'
	}
}

export function combinePatches(files: FileDiff[]): string {
	return files
		.map((file) => file.patch)
		.filter((patch): patch is string => typeof patch === 'string')
		.join('\n')
}
