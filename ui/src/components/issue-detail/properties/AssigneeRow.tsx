import { useState } from 'react'

import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { PROPERTY_ROW_TRIGGER, PropertyRow } from '@/components/issue-detail/properties/PropertyRow'
import { AssigneePicker } from '@/components/issues/pickers/AssigneePicker'
import { useLinearOptions } from '@/hooks/useLinearOptions'
import { useUpdateIssue } from '@/hooks/useUpdateIssue'
import type { IssueDetailResponse, UserOption } from '@/types'
import { Popover } from '@base-ui/react/popover'

interface AssigneeRowProps {
	issue: IssueDetailResponse
}

export function AssigneeRow({ issue }: AssigneeRowProps) {
	const [open, setOpen] = useState(false)
	const { data: options } = useLinearOptions()
	const mutation = useUpdateIssue(issue.id)

	const users: UserOption[] = options?.users ?? []

	const onSelect = (next: UserOption | null) => {
		setOpen(false)
		const currentId = issue.assignee?.id ?? null
		const nextId = next?.id ?? null
		if (nextId === currentId) return
		mutation.mutate({
			patch: { assignee_id: nextId },
			optimistic: (previous) => ({
				...previous,
				assignee: next ? { id: next.id, name: next.name, avatar_url: next.avatar_url } : null
			})
		})
	}

	return (
		<PropertyRow label="Assignee">
			<Popover.Root open={open} onOpenChange={setOpen}>
				<Popover.Trigger className={PROPERTY_ROW_TRIGGER} aria-label="Change assignee">
					{issue.assignee ? (
						<span className="inline-flex items-center gap-2">
							<AuthorAvatar name={issue.assignee.name} avatarUrl={issue.assignee.avatar_url} />
							<span className="truncate">{issue.assignee.name}</span>
						</span>
					) : (
						<span className="text-fg-dim">Unassigned</span>
					)}
				</Popover.Trigger>
				<AssigneePicker users={users} currentId={issue.assignee?.id ?? null} onSelect={onSelect} />
			</Popover.Root>
		</PropertyRow>
	)
}
