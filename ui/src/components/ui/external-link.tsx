import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'

import { isDesktopShell } from '@/lib/desktop'
import { openExternal } from '@/lib/openExternal'

interface ExternalLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target'> {
	href: string
	children: ReactNode
}

export function ExternalLink({ href, children, rel, onClick, ...rest }: ExternalLinkProps) {
	function handleClick(event: MouseEvent<HTMLAnchorElement>) {
		onClick?.(event)
		if (event.defaultPrevented) {
			return
		}
		// Let modified clicks (open-in-new-tab, etc.) keep native browser behavior.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
			return
		}
		// In a plain browser the native anchor already opens the tab; only the
		// desktop webview needs the opener-plugin detour.
		if (!isDesktopShell()) {
			return
		}
		event.preventDefault()
		void openExternal(href)
	}

	return (
		<a href={href} target="_blank" rel={rel ?? 'noopener noreferrer'} onClick={handleClick} {...rest}>
			{children}
		</a>
	)
}
