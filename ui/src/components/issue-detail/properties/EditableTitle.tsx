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
				className="issue-title input"
				style={{ width: '100%' }}
				aria-label="Issue title"
			/>
		)
	}

	return (
		<button
			type="button"
			className="issue-title"
			onClick={() => setEditing(true)}
			aria-label="Edit title"
			style={{
				appearance: 'none',
				background: 'none',
				border: 'none',
				padding: 0,
				margin: 0,
				width: '100%',
				textAlign: 'left',
				fontFamily: 'inherit',
				cursor: 'text'
			}}
		>
			{issue.title}
		</button>
	)
}
