import { useState } from 'react'

import { PopoverPopup } from '@/components/ui/popover-shell'
import type { ProjectOption } from '@/types'

import { filterByName } from './filterByName'
import { PopBody, PopHeader, Popline } from './popoverParts'

interface ProjectPickerProps {
	projects: ProjectOption[]
	currentId: string | null
	onSelect: (next: ProjectOption | null) => void
}

export function ProjectPicker({ projects, currentId, onSelect }: ProjectPickerProps) {
	const [query, setQuery] = useState('')
	const filtered = filterByName(projects, query)

	return (
		<PopoverPopup popupClassName="w-72 max-h-80 overflow-hidden flex flex-col p-0">
			<PopHeader
				value={query}
				onChange={setQuery}
				placeholder="Set project…"
				ariaLabel="Filter projects"
			/>
			<PopBody ariaLabel="Project">
				{filtered.map((project) => (
					<Popline
						key={project.id}
						selected={project.id === currentId}
						onClick={() => onSelect(project)}
					>
						<span className="row__project" style={{ color: 'var(--fg)' }}>
							<span
								className="dot"
								style={project.color ? { background: project.color } : undefined}
							/>
							<span className="truncate">{project.name}</span>
						</span>
					</Popline>
				))}
				<Popline dim selected={currentId === null} onClick={() => onSelect(null)}>
					No project
				</Popline>
			</PopBody>
		</PopoverPopup>
	)
}
