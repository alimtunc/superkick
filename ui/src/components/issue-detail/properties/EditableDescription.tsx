import { useState } from 'react'

import { IssueMarkdown } from '@/components/issue-detail/IssueMarkdown'
import { useUpdateIssue } from '@/hooks/useUpdateIssue'
import type { IssueDetailResponse } from '@/types'
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
			<div className="rounded-md border border-border bg-surface p-3">
				<textarea
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					rows={10}
					autoFocus
					className="block w-full resize-y rounded border border-border bg-canvas px-2.5 py-2 text-[13px] leading-relaxed text-fg focus:border-border-strong focus:outline-none"
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
		<div className="group relative max-w-180">
			{hasDescription ? (
				<IssueMarkdown text={issue.description} className="text-[13.5px] leading-[1.65] text-fg" />
			) : (
				<p className="text-[13px] text-fg-dim">No description.</p>
			)}
			<button
				type="button"
				onClick={open}
				className="absolute top-0 right-0 rounded border border-border bg-surface px-2 py-0.5 text-[11.5px] text-fg-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				aria-label="Edit description"
			>
				Edit
			</button>
		</div>
	)
}
