import { SnippetHighlight } from '@/components/command/MatchHighlight'
import { ResultRowShell } from '@/components/command/ResultRowShell'
import { formatShortDate } from '@/lib/format'
import type { SearchCommentRow } from '@/types'
import { Icon } from '@/ui/Icon'

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
			leading={<Icon name="comment" size={13} className="text-fg-muted" />}
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
