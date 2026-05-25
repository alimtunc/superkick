import type { ReactNode } from 'react'

import { FileDiffRow } from '@/components/run-detail/RunWorkspaceTabs/FileDiffRow'
import { PullRequestHeader } from '@/components/run-detail/RunWorkspaceTabs/PullRequestHeader'
import { TabEmptyState } from '@/components/ui/state-empty-tab'
import { runDiffQuery } from '@/lib/queries'
import type { PullRequest, Run, RunState } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { FileDiff as FileDiffIcon } from 'lucide-react'

interface ChangesTabProps {
	run: Run
	pr: PullRequest | null
}

const NON_DIFFABLE_STATES: ReadonlySet<RunState> = new Set<RunState>(['queued', 'preparing'])

export function ChangesTab({ run, pr }: ChangesTabProps) {
	const enabled = !NON_DIFFABLE_STATES.has(run.state)
	const { data, isLoading, error } = useQuery(runDiffQuery(run.id, enabled))

	const header = pr ? <PullRequestHeader pr={pr} /> : null

	if (!enabled || isLoading) {
		return (
			<ChangesTabShell header={header}>
				<TabEmptyState icon={FileDiffIcon} title="Loading file changes…" />
			</ChangesTabShell>
		)
	}

	if (error) {
		return (
			<ChangesTabShell header={header}>
				<TabEmptyState
					icon={FileDiffIcon}
					title="File diff unavailable"
					description="The diff endpoint failed. Refresh the page to retry."
				/>
			</ChangesTabShell>
		)
	}

	if (data?.kind === 'unavailable') {
		const description =
			data.reason === 'not_worktree_backed'
				? 'This run did not use a worktree, so per-file diffs are not collected.'
				: 'The worktree has been cleaned up — no file diff is available.'
		return (
			<ChangesTabShell header={header}>
				<TabEmptyState icon={FileDiffIcon} title="No diff captured" description={description} />
			</ChangesTabShell>
		)
	}

	const diff = data?.value.diff
	if (!diff || diff.files.length === 0) {
		return (
			<ChangesTabShell header={header}>
				<TabEmptyState
					icon={FileDiffIcon}
					title="No file changes yet"
					description="Diffs will appear here once the run edits files in its worktree."
				/>
			</ChangesTabShell>
		)
	}

	return (
		<ChangesTabShell header={header}>
			<div className="font-data px-4 py-2 text-[11px] text-fg-dim">
				<span className="font-mono">{diff.baseRef.slice(0, 7)}</span>
				{' → '}
				<span className="font-mono">{diff.headRef.slice(0, 7)}</span>
				{' · '}
				{diff.fileCount} file{diff.fileCount === 1 ? '' : 's'}
				{diff.overflow ? ' · capped' : null}
			</div>
			<ul className="divide-y divide-edge">
				{diff.files.map((file) => (
					<FileDiffRow key={file.path} file={file} />
				))}
			</ul>
		</ChangesTabShell>
	)
}

function ChangesTabShell({ header, children }: { header: ReactNode; children: ReactNode }) {
	return (
		<div className="flex h-full min-h-0 flex-col">
			{header}
			{children}
		</div>
	)
}
