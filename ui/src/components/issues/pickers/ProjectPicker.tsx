import { useState } from 'react'

import { PopoverPopup } from '@/components/ui/popover-shell'
import type { ProjectOption } from '@/types'
import { Icon } from '@/ui'

interface ProjectPickerProps {
	projects: ProjectOption[]
	currentId: string | null
	onSelect: (next: ProjectOption | null) => void
}

export function ProjectPicker({ projects, currentId, onSelect }: ProjectPickerProps) {
	const [query, setQuery] = useState('')
	const filtered =
		query.trim().length === 0
			? projects
			: projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()))

	return (
		<PopoverPopup popupClassName="w-72 max-h-80 overflow-hidden flex flex-col p-0">
			<div className="border-b border-border p-2">
				<input
					type="text"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search projects…"
					autoFocus
					className="w-full rounded border border-border bg-canvas px-2 py-1.5 text-[12.5px] text-fg placeholder:text-fg-dim focus:border-border-strong focus:outline-none"
					aria-label="Filter projects"
				/>
			</div>
			<div className="flex flex-col overflow-y-auto p-1" role="listbox" aria-label="Project">
				<button
					type="button"
					role="option"
					aria-selected={currentId === null}
					onClick={() => onSelect(null)}
					className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-fg-dim hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
				>
					No project
					{currentId === null ? <span>✓</span> : null}
				</button>
				{filtered.map((project) => {
					const selected = project.id === currentId
					return (
						<button
							key={project.id}
							type="button"
							role="option"
							aria-selected={selected}
							onClick={() => onSelect(project)}
							className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-fg hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none"
						>
							<span className="inline-flex items-center gap-2">
								<Icon name="folder" size={12} className="text-fg-dim" />
								<span className="truncate">{project.name}</span>
							</span>
							{selected ? <span className="text-fg-dim">✓</span> : null}
						</button>
					)
				})}
			</div>
		</PopoverPopup>
	)
}
