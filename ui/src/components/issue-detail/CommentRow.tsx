import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { fmtRelativeTime } from '@/lib/domain'
import type { IssueComment } from '@/types'

export function CommentRow({ comment }: { comment: IssueComment }) {
	const name = comment.author?.name ?? 'Unknown'

	return (
		<div className="flex gap-3 px-4 py-3">
			<AuthorAvatar name={name} avatarUrl={comment.author?.avatar_url ?? null} />
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<span className="font-data text-[11px] font-medium text-silver">{name}</span>
					<span className="font-data text-[10px] text-dim">
						{fmtRelativeTime(comment.created_at)}
					</span>
				</div>
				<pre className="font-data mt-1 text-[12px] leading-relaxed whitespace-pre-wrap text-silver/80">
					{comment.body}
				</pre>
			</div>
		</div>
	)
}
