import { useState } from 'react'

import type { V1StateFilter } from '@/types'

export function useIssueFilters() {
	const [activeV1State, setActiveV1State] = useState<V1StateFilter>('all')
	const [search, setSearch] = useState('')
	const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set())
	const [activeProject, setActiveProject] = useState<string | null>(null)
	const [activePriorities, setActivePriorities] = useState<Set<number>>(new Set())

	function toggleLabel(label: string) {
		setActiveLabels((prev) => {
			const next = new Set(prev)
			if (next.has(label)) {
				next.delete(label)
			} else {
				next.add(label)
			}
			return next
		})
	}

	function clearLabels() {
		setActiveLabels(new Set())
	}

	function togglePriority(value: number) {
		setActivePriorities((prev) => {
			const next = new Set(prev)
			if (next.has(value)) {
				next.delete(value)
			} else {
				next.add(value)
			}
			return next
		})
	}

	function clearPriorities() {
		setActivePriorities(new Set())
	}

	function clearAllFilters() {
		clearLabels()
		setActiveProject(null)
		clearPriorities()
	}

	return {
		activeV1State,
		setActiveV1State,
		search,
		setSearch,
		activeLabels,
		toggleLabel,
		clearLabels,
		activeProject,
		setActiveProject,
		activePriorities,
		togglePriority,
		clearPriorities,
		clearAllFilters
	}
}

export type IssueFiltersState = ReturnType<typeof useIssueFilters>
