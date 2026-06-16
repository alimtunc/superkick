import { useState } from 'react'

import { IssueMarkdown } from '@/components/issue-detail/IssueMarkdown'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateIssue } from '@/hooks/useUpdateIssue'
import type { IssueDetailResponse } from '@/types'
import { Icon } from '@/ui'
import { Btn } from '@/ui/Btn'

interface EditableDescriptionProps {
	issue: IssueDetailResponse
}

export function EditableDescription({ issue }: EditableDescriptionProps) {
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(issue.description)
	const mutation = useUpdateIssue(issue.id)

	const hasDescription = issue.description.trim().length > 0

	const open = () => {
		setDraft(issue.description)
		setEditing(true)
	}

	const cancel = () => {
		setDraft(issue.description)
		setEditing(false)
	}

	const save = () => {
		const next = draft
		if (next === issue.description) {
			setEditing(false)
			return
		}
		mutation.mutate({
			patch: { description: next },
			optimistic: (previous) => ({ ...previous, description: next })
		})
		setEditing(false)
	}

	if (editing) {
		return (
			<div className="on-raised rounded-md border border-border bg-raised p-3">
				<Textarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					rows={10}
					autoFocus
					className="resize-y"
					aria-label="Description"
				/>
				<div className="mt-2 flex items-center justify-end gap-2">
					<Btn kind="ghost" size="sm" onClick={cancel}>
						Cancel
					</Btn>
					<Btn kind="primary" size="sm" onClick={save}>
						Save
					</Btn>
				</div>
			</div>
		)
	}

	return (
		<div className="group relative">
			{hasDescription ? (
				<div className="md">
					<IssueMarkdown text={issue.description} bare />
				</div>
			) : (
				<div className="md md--empty">No description.</div>
			)}
			<button
				type="button"
				onClick={open}
				className="iconbtn absolute top-0 right-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
				aria-label="Edit description"
			>
				<Icon name="doc" size={14} className="ic" />
			</button>
		</div>
	)
}
