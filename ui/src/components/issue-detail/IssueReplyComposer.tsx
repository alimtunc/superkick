import { useCallback, useState, type KeyboardEvent } from 'react'

import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { useCreateIssueComment } from '@/hooks/useCreateIssueComment'
import { useViewer } from '@/hooks/useViewer'
import { Icon } from '@/ui'
import { Btn } from '@/ui/Btn'
import { Kbd } from '@/ui/Kbd'

export const ISSUE_REPLY_COMPOSER_ID = 'issue-reply-composer'

const TOOLBAR_BTN =
	'inline-flex size-6 items-center justify-center rounded-md text-fg-dim transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-fg-dim'

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
		<div id={ISSUE_REPLY_COMPOSER_ID} className="rounded-lg border border-border bg-surface">
			<div className="flex items-start gap-2.5 px-3 pt-3">
				{viewer ? (
					<AuthorAvatar name={viewer.name} avatarUrl={viewer.avatar_url} />
				) : (
					<span
						aria-hidden="true"
						className="mt-0.5 size-5 shrink-0 rounded-full border border-border bg-raised"
					/>
				)}
				<textarea
					value={value}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={onKeyDown}
					disabled={mutation.isPending}
					placeholder="Leave a comment…"
					rows={2}
					className="block w-full resize-none bg-transparent text-[13px] leading-5 text-fg placeholder:text-fg-dim focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
					aria-label="Leave a comment"
				/>
			</div>
			<div className="flex items-center justify-between gap-2 px-3 pt-1.5 pb-2">
				<div className="flex items-center gap-0.5">
					<button type="button" disabled className={TOOLBAR_BTN} aria-label="Attach link">
						<Icon name="link" size={13} />
					</button>
					<button type="button" disabled className={TOOLBAR_BTN} aria-label="Attach file">
						<Icon name="doc" size={13} />
					</button>
					<button type="button" disabled className={TOOLBAR_BTN} aria-label="Insert code block">
						<Icon name="terminal" size={13} />
					</button>
				</div>
				<div className="flex items-center gap-2 text-[11px] text-fg-dim">
					<span className="inline-flex items-center gap-1">
						<Kbd>⌘</Kbd>
						<Kbd>↵</Kbd>
					</span>
					<Btn kind="primary" size="sm" disabled={!canSubmit} onClick={submit}>
						{mutation.isPending ? 'Posting…' : 'Comment'}
					</Btn>
				</div>
			</div>
		</div>
	)
}
