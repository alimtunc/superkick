import { useMemo, useState } from 'react'

import { PrBadge } from '@/components/pr/PrBadge'
import { FileDiffRow } from '@/components/run-detail/RunWorkspaceTabs/FileDiffRow'
import { SideDrawer } from '@/components/ui/side-drawer'
import { EmptyState } from '@/components/ui/state-empty'
import { issuePullRequestDiffQuery } from '@/lib/queries'
import type {
	DiffViewMode,
	FileDiff,
	FileDiffStatus,
	IssueDetailResponse,
	IssuePrDiffFileStatus,
	IssuePullRequest
} from '@/types'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { useQuery } from '@tanstack/react-query'
import { FileDiff as FileDiffIcon } from 'lucide-react'

const TOGGLE_CLASS =
	'rounded-[3px] px-2 py-0.5 text-[11px] text-fg-dim hover:text-fg data-[pressed]:bg-surface data-[pressed]:text-fg'

interface IssuePrDiffDrawerProps {
	issue: IssueDetailResponse
	pr: IssuePullRequest | null
	open: boolean
	onClose: () => void
}

export function IssuePrDiffDrawer({ issue, pr, open, onClose }: IssuePrDiffDrawerProps) {
	const [mode, setMode] = useState<DiffViewMode>('unified')
	const { data, isLoading, error } = useQuery(issuePullRequestDiffQuery(issue.id, pr, open))
	const files = useMemo(() => data?.files.map(toFileDiff) ?? [], [data])

	if (!pr) return null

	return (
		<SideDrawer
			open={open}
			onClose={onClose}
			title="Pull request diff"
			closeAriaLabel="Close pull request diff"
			width="two-thirds"
			resizable
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className="border-b border-border px-4 py-3">
					<div className="flex min-w-0 items-center gap-2">
						<PrBadge pr={data?.pr ?? pr} size="sm" />
						<span className="min-w-0 truncate text-[13px] font-medium text-fg">
							{data?.pr.title || pr.title || `Pull request #${pr.number}`}
						</span>
					</div>
					<div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] text-fg-dim">
						<span className="mono truncate">{pr.repo_slug}</span>
						{(data?.pr.head_branch || pr.head_branch) &&
						(data?.pr.base_branch || pr.base_branch) ? (
							<>
								<span aria-hidden="true">/</span>
								<span className="mono truncate">
									{data?.pr.base_branch || pr.base_branch} &lt;-{' '}
									{data?.pr.head_branch || pr.head_branch}
								</span>
							</>
						) : null}
					</div>
				</div>

				{isLoading ? (
					<EmptyDiffState title="Loading PR diff..." />
				) : error ? (
					<EmptyDiffState title="PR diff unavailable" />
				) : files.length === 0 ? (
					<EmptyDiffState title="No file changes" />
				) : (
					<>
						<div className="flex items-center gap-4 border-b border-border px-4 py-3 text-[12px] text-fg-dim">
							<FileDiffIcon size={14} strokeWidth={1.75} aria-hidden="true" />
							<span>
								{files.length} file{files.length === 1 ? '' : 's'}
							</span>
							<ToggleGroup<DiffViewMode>
								value={[mode]}
								onValueChange={(value) => {
									const next = value[0]
									if (next) setMode(next)
								}}
								aria-label="Diff layout"
								className="ml-auto flex items-center gap-1"
							>
								<Toggle value="unified" className={TOGGLE_CLASS}>
									Unified
								</Toggle>
								<Toggle value="split" className={TOGGLE_CLASS}>
									Split
								</Toggle>
							</ToggleGroup>
						</div>
						<div className="min-h-0 flex-1 overflow-y-auto">
							{files.map((file) => (
								<FileDiffRow
									key={`${file.path}:${file.oldPath ?? ''}`}
									file={file}
									mode={mode}
								/>
							))}
						</div>
					</>
				)}
			</div>
		</SideDrawer>
	)
}

function EmptyDiffState({ title }: { title: string }) {
	return (
		<div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
			<EmptyState icon={FileDiffIcon} title={title} density="compact" className="w-full max-w-sm" />
		</div>
	)
}

function toFileDiff(file: {
	path: string
	old_path?: string | null
	status: IssuePrDiffFileStatus
	additions: number
	deletions: number
	patch?: string | null
}): FileDiff {
	return {
		path: file.path,
		status: toFileDiffStatus(file.status),
		oldPath: file.old_path,
		additions: file.additions,
		deletions: file.deletions,
		binary: false,
		truncated: false,
		patch: file.patch
	}
}

function toFileDiffStatus(status: IssuePrDiffFileStatus): FileDiffStatus {
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
