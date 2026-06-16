import { useState } from 'react'

import { ConfirmDialog } from '@/components/composites/confirm-dialog'
import { MenuPopup } from '@/components/composites/menu-shell'
import { Btn, Icon } from '@/components/primitives'
import { LaunchComposerDialog } from '@/domains/launch/components/LaunchComposerDialog'
import { useIssueCleanActions } from '@/hooks/useIssueCleanActions'
import type { IssueDetailResponse } from '@/types'
import { Menu } from '@base-ui/react/menu'
import { Archive, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface IssueDetailTopbarRightProps {
	issue: IssueDetailResponse
	isDone: boolean
	onRefresh: () => void
}

export function IssueDetailTopbarRight({ issue, isDone, onRefresh }: IssueDetailTopbarRightProps) {
	const { identifier } = issue
	const [launchOpen, setLaunchOpen] = useState(false)
	const [purgeOpen, setPurgeOpen] = useState(false)

	const launchLabel = isDone ? 'Re-launch' : 'Launch task'
	const launchAriaLabel = isDone ? `Re-launch task for ${identifier}` : `Launch task for ${identifier}`

	const { archive, purge, archivePending, purgePending } = useIssueCleanActions({
		issueIdentifier: identifier,
		issueId: issue.id,
		onPurged: () => setPurgeOpen(false)
	})

	return (
		<>
			<button
				type="button"
				onClick={onRefresh}
				aria-label="Refresh issue data"
				title="Refresh"
				className="iconbtn"
			>
				<RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" className="text-fg-muted" />
			</button>
			<Menu.Root>
				<Menu.Trigger aria-label="More actions" title="More" className="iconbtn">
					<Icon name="more" size={16} className="ic" />
				</Menu.Trigger>
				<MenuPopup align="end" popupClassName="min-w-52">
					<Menu.Item
						onClick={archive}
						disabled={archivePending}
						className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[12.5px] text-fg outline-none data-highlighted:bg-raised data-disabled:cursor-not-allowed data-disabled:opacity-50"
					>
						<Archive size={13} strokeWidth={1.75} aria-hidden="true" />
						Clean issue (archive)
					</Menu.Item>
					<Menu.Item
						onClick={() => setPurgeOpen(true)}
						disabled={purgePending}
						className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[12.5px] text-danger outline-none data-highlighted:bg-raised data-disabled:cursor-not-allowed data-disabled:opacity-50"
					>
						<Trash2 size={13} strokeWidth={1.75} aria-hidden="true" />
						Purge runs & tasks…
					</Menu.Item>
				</MenuPopup>
			</Menu.Root>
			<Btn
				kind={isDone ? 'secondary' : 'primary'}
				size="sm"
				icon={isDone ? 'loop' : 'play'}
				onClick={() => setLaunchOpen(true)}
				aria-label={launchAriaLabel}
			>
				{launchLabel}
			</Btn>

			<LaunchComposerDialog
				open={launchOpen}
				onOpenChange={setLaunchOpen}
				issue={issue}
				title={launchLabel}
				onLaunched={(result) => {
					setLaunchOpen(false)
					toast.success(`Launched ${result.task.linear_issue_id}`)
				}}
			/>

			<ConfirmDialog
				open={purgeOpen}
				onOpenChange={setPurgeOpen}
				title={`Purge runs & tasks on ${identifier}?`}
				description="This permanently deletes every run, launch task, step, and event linked to this issue. It cannot be undone and removes the data from stats. To keep stats, use Clean issue (archive) instead."
				confirmLabel="Purge"
				destructive
				busy={purgePending}
				onConfirm={purge}
			/>
		</>
	)
}
