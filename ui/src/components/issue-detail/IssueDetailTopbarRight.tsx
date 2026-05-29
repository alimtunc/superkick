import { MenuPopup } from '@/components/ui/menu-shell'
import { Btn, Icon } from '@/ui'
import { Menu } from '@base-ui/react/menu'
import { useNavigate } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface IssueDetailTopbarRightProps {
	identifier: string
	isDone: boolean
	onRefresh: () => void
}

function copyCurrentUrlToClipboard() {
	navigator.clipboard.writeText(window.location.href).then(
		() => toast('Link copied'),
		() => toast.error('Failed to copy link')
	)
}

export function IssueDetailTopbarRight({ identifier, isDone, onRefresh }: IssueDetailTopbarRightProps) {
	const navigate = useNavigate()
	const launchLabel = isDone ? 'Re-launch' : 'Launch new run'
	const launchAriaLabel = isDone ? `Re-launch task for ${identifier}` : `Launch new run for ${identifier}`

	return (
		<>
			<button
				type="button"
				disabled
				aria-label="Subscribe to this issue (coming soon)"
				title="Subscribe — coming soon"
				className="iconbtn"
			>
				<Icon name="star" size={16} className="ic" />
			</button>
			<button
				type="button"
				onClick={copyCurrentUrlToClipboard}
				aria-label="Copy link to this issue"
				title="Copy link"
				className="iconbtn"
			>
				<Icon name="copy" size={16} className="ic" />
			</button>
			<Menu.Root>
				<Menu.Trigger aria-label="More actions" title="More" className="iconbtn">
					<Icon name="more" size={16} className="ic" />
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
			<Btn
				kind={isDone ? 'secondary' : 'primary'}
				size="sm"
				icon={isDone ? 'loop' : 'play'}
				onClick={() => navigate({ to: '/tasks/new', search: { issue: identifier } })}
				aria-label={launchAriaLabel}
			>
				{launchLabel}
			</Btn>
		</>
	)
}
