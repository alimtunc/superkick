import { useState } from 'react'

import { PROPERTY_ROW_TRIGGER, PropertyRow } from '@/components/issue-detail/properties/PropertyRow'
import { ProjectPicker } from '@/components/issues/pickers/ProjectPicker'
import { useLinearOptions } from '@/hooks/useLinearOptions'
import { useUpdateIssue } from '@/hooks/useUpdateIssue'
import type { IssueDetailResponse, ProjectOption } from '@/types'
import { Icon } from '@/ui'
import { Popover } from '@base-ui/react/popover'

interface ProjectRowProps {
	issue: IssueDetailResponse
}

export function ProjectRow({ issue }: ProjectRowProps) {
	const [open, setOpen] = useState(false)
	const { data: options } = useLinearOptions()
	const mutation = useUpdateIssue(issue.id)

	const projects = options?.projects ?? []
	const currentId = projects.find((project) => project.name === issue.project?.name)?.id ?? null

	const onSelect = (next: ProjectOption | null) => {
		setOpen(false)
		const nextId = next?.id ?? null
		if (nextId === currentId) return
		mutation.mutate({
			patch: { project_id: nextId },
			optimistic: (previous) => ({
				...previous,
				project: next ? { name: next.name } : null
			})
		})
	}

	return (
		<PropertyRow label="Project">
			<Popover.Root open={open} onOpenChange={setOpen}>
				<Popover.Trigger className={PROPERTY_ROW_TRIGGER} aria-label="Change project">
					{issue.project ? (
						<>
							<Icon name="folder" size={11} className="text-fg-muted" />
							<span className="truncate text-fg">{issue.project.name}</span>
						</>
					) : (
						<span className="text-fg-dim">No project</span>
					)}
				</Popover.Trigger>
				<ProjectPicker projects={projects} currentId={currentId} onSelect={onSelect} />
			</Popover.Root>
		</PropertyRow>
	)
}
