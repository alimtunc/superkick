import { useCallback, useEffect, useState } from 'react'

import type { IssueViewTab } from '@/types'

interface CollapsedBuckets {
	has: (key: string) => boolean
	toggle: (key: string) => void
}

const COLLAPSED_KEY = (tab: IssueViewTab) => `superkick.issues.collapsed.${tab}`

function readCollapsed(tab: IssueViewTab): Set<string> {
	if (typeof window === 'undefined') return new Set()
	try {
		const raw = window.localStorage.getItem(COLLAPSED_KEY(tab))
		if (!raw) return new Set()
		const parsed = JSON.parse(raw) as unknown
		return Array.isArray(parsed)
			? new Set(parsed.filter((v): v is string => typeof v === 'string'))
			: new Set()
	} catch {
		return new Set()
	}
}

function writeCollapsed(tab: IssueViewTab, value: Set<string>) {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(COLLAPSED_KEY(tab), JSON.stringify([...value]))
	} catch {
		// localStorage may be unavailable (private mode); collapse state is best-effort.
	}
}

export function useCollapsedBuckets(tab: IssueViewTab): CollapsedBuckets {
	const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed(tab))

	useEffect(() => {
		setCollapsed(readCollapsed(tab))
	}, [tab])

	const toggle = useCallback(
		(key: string) => {
			setCollapsed((prev) => {
				const next = new Set(prev)
				if (next.has(key)) next.delete(key)
				else next.add(key)
				writeCollapsed(tab, next)
				return next
			})
		},
		[tab]
	)

	const has = useCallback((key: string) => collapsed.has(key), [collapsed])

	return { has, toggle }
}
