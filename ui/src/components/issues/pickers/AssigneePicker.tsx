import { useState } from 'react'

import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { PopoverPopup } from '@/components/ui/popover-shell'
import type { UserOption } from '@/types'

import { PopBody, PopHeader, Popline } from './popoverParts'

interface AssigneePickerProps {
	users: UserOption[]
	currentId: string | null
	onSelect: (next: UserOption | null) => void
}

export function AssigneePicker({ users, currentId, onSelect }: AssigneePickerProps) {
	const [query, setQuery] = useState('')
	const filtered =
		query.trim().length === 0
			? users
			: users.filter((user) => user.name.toLowerCase().includes(query.toLowerCase()))

	return (
		<PopoverPopup popupClassName="w-72 max-h-80 overflow-hidden flex flex-col p-0">
			<PopHeader
				value={query}
				onChange={setQuery}
				placeholder="Assign to…"
				ariaLabel="Filter assignees"
			/>
			<PopBody ariaLabel="Assignee">
				{filtered.map((user) => (
					<Popline key={user.id} selected={user.id === currentId} onClick={() => onSelect(user)}>
						<AuthorAvatar name={user.name} avatarUrl={user.avatar_url} size={16} />
						<span className="truncate">{user.name}</span>
					</Popline>
				))}
				<Popline dim selected={currentId === null} onClick={() => onSelect(null)}>
					<span
						className="avatar avatar--empty avatar--sm"
						style={{ width: 16, height: 16, fontSize: 9 }}
						aria-hidden="true"
					>
						?
					</span>
					<span className="truncate">No assignee</span>
				</Popline>
			</PopBody>
		</PopoverPopup>
	)
}
