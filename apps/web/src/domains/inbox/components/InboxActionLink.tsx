import type { ReactNode } from 'react'

import { ExternalLink } from '@/components/composites/external-link'
import { useWorkspaceChatStore } from '@/stores/workspaceChat'
import type { InboxAction } from '@/types'
import { Link } from '@tanstack/react-router'

interface InboxActionLinkProps {
	action: InboxAction
	children: ReactNode
	className?: string
	ariaLabel?: string
}

export function InboxActionLink({ action, children, className, ariaLabel }: InboxActionLinkProps) {
	const openChat = useWorkspaceChatStore((s) => s.openChat)
	const { destination } = action

	if (destination.kind === 'issue') {
		return (
			<Link
				to="/issues/$issueId"
				params={{ issueId: destination.issueId }}
				className={className}
				aria-label={ariaLabel}
				onClick={destination.openChat ? () => openChat() : undefined}
			>
				{children}
			</Link>
		)
	}

	if (destination.kind === 'run') {
		return (
			<Link
				to="/runs/$runId"
				params={{ runId: destination.runId }}
				hash={destination.hash}
				className={className}
				aria-label={ariaLabel}
				onClick={destination.openChat ? () => openChat() : undefined}
			>
				{children}
			</Link>
		)
	}

	if (destination.kind === 'external') {
		return (
			<ExternalLink href={destination.href} className={className} aria-label={ariaLabel}>
				{children}
			</ExternalLink>
		)
	}

	if (destination.kind === 'dispatch') {
		return (
			<span className={className} aria-label={ariaLabel}>
				{children}
			</span>
		)
	}

	const _exhaustive: never = destination
	void _exhaustive
	return null
}
