import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { useUpdateIssue } from '@/hooks/useUpdateIssue'
import type { IssueDetailResponse } from '@/types'

interface EditableTitleProps {
	issue: IssueDetailResponse
}

export function EditableTitle({ issue }: EditableTitleProps) {
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(issue.title)
	const baselineRef = useRef(issue.title)
	const mutation = useUpdateIssue(issue.id)

	useEffect(() => {
		if (!editing) {
			setDraft(issue.title)
			baselineRef.current = issue.title
		}
	}, [editing, issue.title])

	const commit = () => {
		const next = draft.trim()
		if (next.length === 0 || next === baselineRef.current) {
			setEditing(false)
			return
		}
		mutation.mutate({
			patch: { title: next },
			optimistic: (previous) => ({ ...previous, title: next })
		})
		setEditing(false)
	}

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === 'Enter') {
			event.preventDefault()
			commit()
			return
		}
		if (event.key === 'Escape') {
			event.preventDefault()
			setDraft(baselineRef.current)
			setEditing(false)
		}
	}

	if (editing) {
		return (
			<input
				type="text"
				value={draft}
				autoFocus
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={onKeyDown}
				onBlur={commit}
				className="w-full rounded border border-border-strong bg-canvas px-2 py-1 text-[18px] leading-tight font-semibold text-fg focus:outline-none"
				aria-label="Issue title"
			/>
		)
	}

	return (
		<button
			type="button"
			onClick={() => setEditing(true)}
			className="-mx-2 w-full rounded border border-transparent px-2 py-1 text-left text-[18px] leading-tight font-semibold text-fg transition-colors hover:border-border hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
			aria-label="Edit title"
		>
			{issue.title}
		</button>
	)
}
