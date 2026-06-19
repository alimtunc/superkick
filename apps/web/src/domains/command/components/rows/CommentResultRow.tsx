import { Icon } from '@/components/primitives'
import { SnippetHighlight } from '@/domains/command/components/MatchHighlight'
import { ResultRowShell } from '@/domains/command/components/ResultRowShell'
import { formatShortDate } from '@/lib/format'
import type { SearchCommentRow } from '@/types'

interface CommentResultRowProps {
	comment: SearchCommentRow
	selected: boolean
	onSelect: () => void
	onActivate: () => void
}

export function CommentResultRow({ comment, selected, onSelect, onActivate }: CommentResultRowProps) {
	const author = comment.authorName ?? 'unknown'
	const age = formatShortDate(comment.createdAt)
	return (
		<ResultRowShell
			selected={selected}
			onSelect={onSelect}
			onActivate={onActivate}
			leading={<Icon name="comment" size={16} className="text-fg-muted" />}
			primary={
				<span className="text-fg-muted">
					<span className="text-fg">{author}</span> on{' '}
					<span className="font-mono">{comment.issueIdentifier}</span> · {age}
				</span>
			}
			secondary={
				<span className="italic">
					<SnippetHighlight
						snippet={comment.snippet}
						matchStart={comment.matchStart}
						matchEnd={comment.matchEnd}
					/>
				</span>
			}
		/>
	)
}
