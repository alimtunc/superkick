import { ActionResultRow } from '@/components/command/rows/ActionResultRow'
import { CommentResultRow } from '@/components/command/rows/CommentResultRow'
import { FileResultRow } from '@/components/command/rows/FileResultRow'
import { IssueResultRow } from '@/components/command/rows/IssueResultRow'
import { RunResultRow } from '@/components/command/rows/RunResultRow'
import { SectionHeader } from '@/components/command/SectionHeader'
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

function ScopedFlat({
	type,
	results,
	query,
	selectedIdx,
	onSelect,
	onActivate
}: ScopedSectionsViewProps & { type: 'comments' | 'files' | 'runs' | 'actions' }) {
	if (type === 'comments') {
		return (
			<div className="flex flex-col py-1">
				<SectionHeader title="Comments" count={results.comments.length} />
				{results.comments.map((comment, i) => (
					<CommentResultRow
						key={comment.commentId}
						comment={comment}
						selected={i === selectedIdx}
						onSelect={() => onSelect(i)}
						onActivate={() => onActivate(`/issues/${comment.issueId}`)}
					/>
				))}
			</div>
		)
	}
	if (type === 'files') {
		return (
			<div className="flex flex-col py-1">
				<SectionHeader title="Files" count={results.files.length} />
				{results.files.map((file, i) => (
					<FileResultRow
						key={file.path}
						file={file}
						query={query}
						selected={i === selectedIdx}
						onSelect={() => onSelect(i)}
						onActivate={() => onActivate(null)}
					/>
				))}
			</div>
		)
	}
	if (type === 'runs') {
		return (
			<div className="flex flex-col py-1">
				<SectionHeader title="Runs" count={results.runs.length} />
				{results.runs.map((run, i) => (
					<RunResultRow
						key={run.runId}
						run={run}
						selected={i === selectedIdx}
						onSelect={() => onSelect(i)}
						onActivate={() => onActivate(`/runs/${run.runId}`)}
					/>
				))}
			</div>
		)
	}
	return (
		<div className="flex flex-col py-1">
			<SectionHeader title="Actions" count={results.actions.length} />
			{results.actions.map((action, i) => (
				<ActionResultRow
					key={action.id}
					action={action}
					query={query}
					selected={i === selectedIdx}
					onSelect={() => onSelect(i)}
					onActivate={() => onActivate(action.target ?? null)}
				/>
			))}
		</div>
	)
}

function isDone(stateType: string): boolean {
	return stateType === 'completed' || stateType === 'canceled'
}
