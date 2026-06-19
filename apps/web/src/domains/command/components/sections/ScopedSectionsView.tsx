import type { ReactNode } from 'react'

import { isDone } from '@/domains/command/components/commandSections'
import { ActionResultRow } from '@/domains/command/components/rows/ActionResultRow'
import { CommentResultRow } from '@/domains/command/components/rows/CommentResultRow'
import { FileResultRow } from '@/domains/command/components/rows/FileResultRow'
import { IssueResultRow } from '@/domains/command/components/rows/IssueResultRow'
import { RunResultRow } from '@/domains/command/components/rows/RunResultRow'
import { SectionHeader } from '@/domains/command/components/SectionHeader'
import type { SearchResponse, SearchScope } from '@/types'

interface ScopedSectionsViewProps {
	scope: Exclude<SearchScope, 'all'>
	results: SearchResponse
	query: string
	selectedIdx: number
	includeDone: boolean
	onSelect: (idx: number) => void
	onActivate: (target: string | null) => void
	onToggleDone: () => void
}

export function ScopedSectionsView(props: ScopedSectionsViewProps) {
	switch (props.scope) {
		case 'issues':
			return <ScopedIssues {...props} />
		case 'comments':
			return <ScopedFlat type="comments" {...props} />
		case 'files':
			return <ScopedFlat type="files" {...props} />
		case 'runs':
			return <ScopedFlat type="runs" {...props} />
		case 'actions':
			return <ScopedFlat type="actions" {...props} />
	}
}

function ScopedIssues({
	results,
	query,
	selectedIdx,
	includeDone,
	onSelect,
	onActivate,
	onToggleDone
}: ScopedSectionsViewProps) {
	const openIssues = results.issues.filter((i) => !isDone(i.stateType))
	const doneIssues = results.issues.filter((i) => isDone(i.stateType))
	let idx = 0
	return (
		<div className="flex flex-col py-1">
			<SectionHeader title="Open" count={openIssues.length} />
			{openIssues.map((issue) => {
				const myIdx = idx++
				return (
					<IssueResultRow
						key={issue.id}
						issue={issue}
						query={query}
						selected={myIdx === selectedIdx}
						onSelect={() => onSelect(myIdx)}
						onActivate={() => onActivate(`/issues/${issue.id}`)}
					/>
				)
			})}

			{doneIssues.length > 0 ? (
				<>
					<SectionHeader
						title="Done"
						count={doneIssues.length}
						trailing={
							<button
								type="button"
								onClick={onToggleDone}
								className="text-[10.5px] tracking-wider text-fg-dim normal-case hover:text-fg"
							>
								{includeDone ? 'hide' : 'hidden by default · show'}
							</button>
						}
					/>
					{includeDone
						? doneIssues.map((issue) => {
								const myIdx = idx++
								return (
									<IssueResultRow
										key={issue.id}
										issue={issue}
										query={query}
										selected={myIdx === selectedIdx}
										onSelect={() => onSelect(myIdx)}
										onActivate={() => onActivate(`/issues/${issue.id}`)}
									/>
								)
							})
						: null}
				</>
			) : null}
		</div>
	)
}

type FlatType = 'comments' | 'files' | 'runs' | 'actions'

interface FlatRowContext {
	query: string
	selectedIdx: number
	onSelect: (idx: number) => void
	onActivate: (target: string | null) => void
}

interface FlatConfig {
	title: string
	count: (results: SearchResponse) => number
	rows: (results: SearchResponse, ctx: FlatRowContext) => ReactNode
}

const FLAT_CONFIG: Record<FlatType, FlatConfig> = {
	comments: {
		title: 'Comments',
		count: (results) => results.comments.length,
		rows: (results, { selectedIdx, onSelect, onActivate }) =>
			results.comments.map((comment, i) => (
				<CommentResultRow
					key={comment.commentId}
					comment={comment}
					selected={i === selectedIdx}
					onSelect={() => onSelect(i)}
					onActivate={() => onActivate(`/issues/${comment.issueId}`)}
				/>
			))
	},
	files: {
		title: 'Files',
		count: (results) => results.files.length,
		rows: (results, { query, selectedIdx, onSelect, onActivate }) =>
			results.files.map((file, i) => (
				<FileResultRow
					key={file.path}
					file={file}
					query={query}
					selected={i === selectedIdx}
					onSelect={() => onSelect(i)}
					onActivate={() => onActivate(null)}
				/>
			))
	},
	runs: {
		title: 'Runs',
		count: (results) => results.runs.length,
		rows: (results, { selectedIdx, onSelect, onActivate }) =>
			results.runs.map((run, i) => (
				<RunResultRow
					key={run.runId}
					run={run}
					selected={i === selectedIdx}
					onSelect={() => onSelect(i)}
					onActivate={() => onActivate(`/runs/${run.runId}`)}
				/>
			))
	},
	actions: {
		title: 'Actions',
		count: (results) => results.actions.length,
		rows: (results, { query, selectedIdx, onSelect, onActivate }) =>
			results.actions.map((action, i) => (
				<ActionResultRow
					key={action.id}
					action={action}
					query={query}
					selected={i === selectedIdx}
					onSelect={() => onSelect(i)}
					onActivate={() => onActivate(action.target ?? null)}
				/>
			))
	}
}

function ScopedFlat({
	type,
	results,
	query,
	selectedIdx,
	onSelect,
	onActivate
}: ScopedSectionsViewProps & { type: FlatType }) {
	const config = FLAT_CONFIG[type]
	return (
		<div className="flex flex-col py-1">
			<SectionHeader title={config.title} count={config.count(results)} />
			{config.rows(results, { query, selectedIdx, onSelect, onActivate })}
		</div>
	)
}
