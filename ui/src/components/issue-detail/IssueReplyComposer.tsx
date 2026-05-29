import { useCallback, useState, type KeyboardEvent } from 'react'

import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { useCreateIssueComment } from '@/hooks/useCreateIssueComment'
import { useViewer } from '@/hooks/useViewer'
import { Btn, Icon } from '@/ui'
import { Kbd } from '@/ui/Kbd'

export const ISSUE_REPLY_COMPOSER_ID = 'issue-reply-composer'

interface IssueReplyComposerProps {
	issueId: string
}

export function IssueReplyComposer({ issueId }: IssueReplyComposerProps) {
	const { viewer } = useViewer()
	const [value, setValue] = useState('')
	const mutation = useCreateIssueComment(issueId, viewer)

	const trimmed = value.trim()
	const canSubmit = trimmed.length > 0 && !mutation.isPending

	const submit = useCallback(() => {
		if (!canSubmit) return
		mutation.mutate(trimmed, {
			onSuccess: () => setValue('')
		})
	}, [canSubmit, mutation, trimmed])

	const onKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
				event.preventDefault()
				submit()
			}
		},
		[submit]
	)

	return (
		<div className="composer">
			<div className="composer__box on-raised">
				<div id={ISSUE_REPLY_COMPOSER_ID} className="flex items-start gap-2.5 px-3 pt-2.5">
					{viewer ? (
						<AuthorAvatar name={viewer.name} avatarUrl={viewer.avatar_url} size={20} />
					) : (
						<span aria-hidden="true" className="avatar avatar--empty mt-0.5" />
					)}
					<textarea
						value={value}
						onChange={(event) => setValue(event.target.value)}
						onKeyDown={onKeyDown}
						disabled={mutation.isPending}
						placeholder="Leave a comment…"
						rows={2}
						className="composer__field"
						style={{ padding: 0 }}
						aria-label="Leave a comment"
					/>
				</div>
				<div className="composer__bar">
					<button
						type="button"
						disabled
						className="iconbtn"
						style={{ width: 26, height: 26 }}
						aria-label="Attach link"
					>
						<Icon name="link" size={15} className="ic" />
					</button>
					<button
						type="button"
						disabled
						className="iconbtn"
						style={{ width: 26, height: 26 }}
						aria-label="Attach file"
					>
						<Icon name="doc" size={15} className="ic" />
					</button>
					<button
						type="button"
						disabled
						className="iconbtn"
						style={{ width: 26, height: 26 }}
						aria-label="Insert code block"
					>
						<Icon name="terminal" size={15} className="ic" />
					</button>
					<span className="spacer" />
					<span className="inline-flex items-center gap-1 text-[11px] text-fg-dim">
						<Kbd>⌘</Kbd>
						<Kbd>↵</Kbd>
					</span>
					<Btn kind="primary" size="sm" icon="send" disabled={!canSubmit} onClick={submit}>
						{mutation.isPending ? 'Posting…' : 'Comment'}
					</Btn>
				</div>
			</div>
		</div>
	)
}
