import { useState } from 'react'

import { AuthorAvatar } from '@/components/issue-detail/AuthorAvatar'
import { PopoverPopup } from '@/components/ui/popover-shell'
import type { UserOption } from '@/types'

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
			<div className="border-b border-border p-2">
				<input
					type="text"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search people…"
					autoFocus
					className="w-full rounded border border-border bg-canvas px-2 py-1.5 text-[12.5px] text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
					aria-label="Filter assignees"
				/>
			</div>
			<div className="flex flex-col overflow-y-auto p-1" role="listbox" aria-label="Assignee">
				<button
					type="button"
					role="option"
					aria-selected={currentId === null}
					onClick={() => onSelect(null)}
					className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-fg-dim hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					Unassigned
					{currentId === null ? <span>✓</span> : null}
				</button>
				{filtered.map((user) => {
					const selected = user.id === currentId
					return (
						<button
							key={user.id}
							type="button"
							role="option"
							aria-selected={selected}
							onClick={() => onSelect(user)}
							className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-fg hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
						>
							<span className="inline-flex items-center gap-2">
								<AuthorAvatar name={user.name} avatarUrl={user.avatar_url} />
								<span className="truncate">{user.name}</span>
							</span>
							{selected ? <span className="text-fg-dim">✓</span> : null}
						</button>
					)
				})}
			</div>
		</PopoverPopup>
	)
}
