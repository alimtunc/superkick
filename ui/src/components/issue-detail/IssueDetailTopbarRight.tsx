import { MenuPopup } from '@/components/ui/menu-shell'
import { Btn } from '@/ui/Btn'
import { Menu } from '@base-ui/react/menu'
import { useNavigate } from '@tanstack/react-router'
import { Link as LinkIcon, MoreHorizontal, RefreshCw, Star, Zap } from 'lucide-react'
import { toast } from 'sonner'

const GHOST =
	'inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-fg-dim disabled:hover:bg-transparent disabled:hover:text-fg-dim'

interface IssueDetailTopbarRightProps {
	identifier: string
	onRefresh: () => void
}

function copyCurrentUrlToClipboard() {
	navigator.clipboard.writeText(window.location.href).then(
		() => toast('Link copied'),
		() => toast.error('Failed to copy link')
	)
}

export function IssueDetailTopbarRight({ identifier, onRefresh }: IssueDetailTopbarRightProps) {
	const navigate = useNavigate()

	return (
		<>
			<button
				type="button"
				disabled
				aria-label="Subscribe to this issue (coming soon)"
				title="Subscribe — coming soon"
				className={GHOST}
			>
				<Star size={14} strokeWidth={1.75} aria-hidden="true" />
			</button>
			<button
				type="button"
				onClick={copyCurrentUrlToClipboard}
				aria-label="Copy link to this issue"
				title="Copy link"
				className={GHOST}
			>
				<LinkIcon size={14} strokeWidth={1.75} aria-hidden="true" />
			</button>
			<Menu.Root>
				<Menu.Trigger aria-label="More actions" title="More" className={GHOST}>
					<MoreHorizontal size={14} strokeWidth={1.75} aria-hidden="true" />
				</Menu.Trigger>
				<MenuPopup align="end" popupClassName="min-w-44">
					<Menu.Item
						onClick={onRefresh}
						className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[12.5px] text-fg outline-none data-highlighted:bg-raised"
					>
						<RefreshCw size={13} strokeWidth={1.75} aria-hidden="true" />
						Refresh issue data
					</Menu.Item>
				</MenuPopup>
			</Menu.Root>
			<div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
			<Btn
				kind="primary"
				size="sm"
				onClick={() => navigate({ to: '/tasks/new', search: { issue: identifier } })}
				aria-label={`Launch task for ${identifier}`}
			>
				<Zap size={14} strokeWidth={1.85} aria-hidden="true" />
				Launch task
			</Btn>
		</>
	)
}
