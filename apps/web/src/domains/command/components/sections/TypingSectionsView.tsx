import { SECTION_LIMIT } from '@/domains/command/components/commandSections'
import { ActionResultRow } from '@/domains/command/components/rows/ActionResultRow'
import { CommentResultRow } from '@/domains/command/components/rows/CommentResultRow'
import { FileResultRow } from '@/domains/command/components/rows/FileResultRow'
import { IssueResultRow } from '@/domains/command/components/rows/IssueResultRow'
import { RunResultRow } from '@/domains/command/components/rows/RunResultRow'
import { SectionHeader } from '@/domains/command/components/SectionHeader'
import type { SearchResponse } from '@/types'

interface TypingSectionsViewProps {
	results: SearchResponse
	query: string
	selectedIdx: number
	onSelect: (idx: number) => void
	onActivate: (target: string | null) => void
	onViewAll: (section: 'issues' | 'comments' | 'files' | 'runs') => void
}

export function TypingSectionsView({
	results,
	query,
	selectedIdx,
	onSelect,
	onActivate,
	onViewAll
}: TypingSectionsViewProps) {
	let idx = 0

	const visibleActions = results.actions.slice(0, SECTION_LIMIT)
	const visibleIssues = results.issues.slice(0, SECTION_LIMIT)
	const visibleComments = results.comments.slice(0, SECTION_LIMIT)
	const visibleFiles = results.files.slice(0, SECTION_LIMIT)
	const visibleRuns = results.runs.slice(0, SECTION_LIMIT)

	return (
		<div className="flex flex-col py-1">
			{visibleActions.length > 0 ? (
				<>
					<SectionHeader title="Actions" count={results.actions.length} />
					{visibleActions.map((action) => {
						const myIdx = idx++
						return (
							<ActionResultRow
								key={action.id}
								action={action}
								query={query}
								selected={myIdx === selectedIdx}
								onSelect={() => onSelect(myIdx)}
								onActivate={() => onActivate(action.target ?? null)}
							/>
						)
					})}
				</>
			) : null}

			{visibleIssues.length > 0 ? (
				<>
					<SectionHeader
						title="Issues"
						count={results.issues.length}
						trailing={
							results.issues.length > SECTION_LIMIT ? (
								<ViewAllButton onClick={() => onViewAll('issues')} />
							) : null
						}
					/>
					{visibleIssues.map((issue) => {
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
				</>
			) : null}

			{visibleComments.length > 0 ? (
				<>
					<SectionHeader
						title="Comments"
						count={results.comments.length}
						trailing={
							results.comments.length > SECTION_LIMIT ? (
								<ViewAllButton onClick={() => onViewAll('comments')} />
							) : null
						}
					/>
					{visibleComments.map((comment) => {
						const myIdx = idx++
						return (
							<CommentResultRow
								key={comment.commentId}
								comment={comment}
								selected={myIdx === selectedIdx}
								onSelect={() => onSelect(myIdx)}
								onActivate={() => onActivate(`/issues/${comment.issueId}`)}
							/>
						)
					})}
				</>
			) : null}

			{visibleFiles.length > 0 ? (
				<>
					<SectionHeader
						title="Files"
						count={results.files.length}
						trailing={
							results.files.length > SECTION_LIMIT ? (
								<ViewAllButton onClick={() => onViewAll('files')} />
							) : null
						}
					/>
					{visibleFiles.map((file) => {
						const myIdx = idx++
						return (
							<FileResultRow
								key={file.path}
								file={file}
								query={query}
								selected={myIdx === selectedIdx}
								onSelect={() => onSelect(myIdx)}
								onActivate={() => onActivate(null)}
							/>
						)
					})}
				</>
			) : null}

			{visibleRuns.length > 0 ? (
				<>
					<SectionHeader
						title="Runs"
						count={results.runs.length}
						trailing={
							results.runs.length > SECTION_LIMIT ? (
								<ViewAllButton onClick={() => onViewAll('runs')} />
							) : null
						}
					/>
					{visibleRuns.map((run) => {
						const myIdx = idx++
						return (
							<RunResultRow
								key={run.runId}
								run={run}
								selected={myIdx === selectedIdx}
								onSelect={() => onSelect(myIdx)}
								onActivate={() => onActivate(`/runs/${run.runId}`)}
							/>
						)
					})}
				</>
			) : null}
		</div>
	)
}

function ViewAllButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="text-[10.5px] font-medium tracking-wider text-accent uppercase hover:underline"
		>
			View all
		</button>
	)
}
