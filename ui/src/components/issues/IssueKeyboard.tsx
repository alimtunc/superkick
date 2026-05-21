import { useEffect } from 'react'

import { useNavigate } from '@tanstack/react-router'

interface IssueKeyboardProps {
	identifiers: readonly string[]
	focusedIdentifier: string | null
	onFocus: (identifier: string | null) => void
	onOpenFilter: () => void
}

/**
 * Global keyboard layer for `/issues`. Handlers run only when the issues
 * route is active *and* no input/textarea has focus (the shell mounts
 * this component once at the issues route, so the "route is active"
 * check is implicit in the mount lifecycle).
 *
 *  - j / k  → move the focus marker down / up the visible identifier list
 *  - Enter  → navigate to the focused issue's detail page
 *  - l      → open the Launch composer pre-filled with the focused issue
 *  - f      → call `onOpenFilter` to open the `+ Filter` dropdown
 */
export function IssueKeyboard({ identifiers, focusedIdentifier, onFocus, onOpenFilter }: IssueKeyboardProps) {
	const navigate = useNavigate()

	useEffect(() => {
		function isEditable(target: EventTarget | null): boolean {
			if (!(target instanceof HTMLElement)) return false
			const tag = target.tagName
			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
			return target.isContentEditable
		}

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

	return null
}
