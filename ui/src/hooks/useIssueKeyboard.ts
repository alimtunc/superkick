import { useEffect } from 'react'

import { useNavigate } from '@tanstack/react-router'

interface UseIssueKeyboardOptions {
	identifiers: readonly string[]
	focusedIdentifier: string | null
	onFocus: (identifier: string | null) => void
	onOpenFilter: () => void
}

function isEditable(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false
	const tag = target.tagName
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
	return target.isContentEditable
}

export function useIssueKeyboard({
	identifiers,
	focusedIdentifier,
	onFocus,
	onOpenFilter
}: UseIssueKeyboardOptions): void {
	const navigate = useNavigate()

	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (isEditable(event.target)) return
			if (event.metaKey || event.ctrlKey || event.altKey) return

			const idx = focusedIdentifier ? identifiers.indexOf(focusedIdentifier) : -1

			if (event.key === 'j') {
				event.preventDefault()
				const next = Math.min(identifiers.length - 1, idx + 1)
				if (next >= 0) onFocus(identifiers[next])
				return
			}
			if (event.key === 'k') {
				event.preventDefault()
				const next = Math.max(0, idx - 1)
				if (identifiers.length > 0) onFocus(identifiers[next])
				return
			}
			if (event.key === 'Enter' && focusedIdentifier) {
				event.preventDefault()
				navigate({ to: '/issues/$issueId', params: { issueId: focusedIdentifier } })
				return
			}
			if (event.key === 'l' && focusedIdentifier) {
				event.preventDefault()
				navigate({ to: '/tasks/new', search: { issue: focusedIdentifier } })
				return
			}
			if (event.key === 'f') {
				event.preventDefault()
				onOpenFilter()
			}
		}

		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [identifiers, focusedIdentifier, navigate, onFocus, onOpenFilter])
}
