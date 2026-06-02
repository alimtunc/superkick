import { InboxSectionBody } from '@/components/inbox/InboxSectionBody'
import { ReadyToLaunchRow } from '@/components/inbox/ReadyToLaunchRow'
import { LaunchDialog } from '@/components/launch/LaunchDialog'
import { useConfig } from '@/hooks/useConfig'
import { useLaunchFromInbox } from '@/hooks/useLaunchFromInbox'
import { useLaunchQueue } from '@/hooks/useLaunchQueue'
import type { LaunchQueueItem } from '@/types'

export function ReadyToLaunchSection() {
	const launchQueue = useLaunchQueue()
	const { config } = useConfig()
	const launchProfile = config?.launch_profile
	const launch = useLaunchFromInbox({ launchProfile })

	const items = (launchQueue.groups['launchable'] ?? []).filter(
		(item): item is Extract<LaunchQueueItem, { kind: 'issue' }> => item.kind === 'issue'
	)

	const errorMessage = launchQueue.error
		? `Linear unavailable — ${launchQueue.error}. Other sections still work.`
		: null

	return (
		<>
			<InboxSectionBody
				loading={launchQueue.loading}
				error={errorMessage}
				emptyMessage="No launchable issues. Move a Linear issue to In Progress to queue it."
				isEmpty={items.length === 0}
			>
				{items.map((item, index) => (
					<ReadyToLaunchRow
						key={`issue:${item.issue.id}`}
						item={item}
						dispatchPosition={index + 1}
						onDispatch={launch.openFor}
						dispatchPending={launch.isPending}
					/>
				))}
			</InboxSectionBody>
			{launchProfile ? (
				<LaunchDialog
					open={launch.dialog.open}
					profile={launchProfile}
					useWorktree={launch.dialog.useWorktree}
					isPending={launch.isPending}
					canLaunch={launch.canLaunch}
					agents={launch.agents}
					selection={launch.selection}
					agentsLoading={launch.agentsLoading}
					onAgentChange={launch.setAgent}
					onUseWorktreeChange={launch.dialog.setUseWorktree}
					onLaunch={launch.confirm}
					onClose={launch.close}
				/>
			) : null}
		</>
	)
}
