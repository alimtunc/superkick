import { InboxCapacityBadge } from '@/components/inbox/InboxCapacityBadge'
import { InboxSection } from '@/components/inbox/InboxSection'
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

	const subtitle = launchQueue.loading ? null : <InboxCapacityBadge capacity={launchQueue.activeCapacity} />
	const errorMessage = launchQueue.error
		? `Linear unavailable — ${launchQueue.error}. Other sections still work.`
		: null

	return (
		<>
			<InboxSection
				title="Ready to Launch"
				count={launchQueue.loading ? null : items.length}
				subtitle={subtitle}
			>
				<InboxSectionBody
					loading={launchQueue.loading}
					error={errorMessage}
					emptyMessage="No launchable issues. Move a Linear issue to In Progress to queue it for dispatch."
					isEmpty={items.length === 0}
				>
					<div className="divide-y divide-edge/50 overflow-hidden rounded border border-edge">
						{items.map((item, index) => (
							<ReadyToLaunchRow
								key={`issue:${item.issue.id}`}
								item={item}
								dispatchPosition={index + 1}
								onDispatch={launch.openFor}
								dispatchPending={launch.isPending}
							/>
						))}
					</div>
				</InboxSectionBody>
			</InboxSection>
			{launchProfile ? (
				<LaunchDialog
					open={launch.dialog.open}
					profile={launchProfile}
					instructions={launch.dialog.instructions}
					useWorktree={launch.dialog.useWorktree}
					executionMode={launch.dialog.executionMode}
					isPending={launch.isPending}
					onInstructionsChange={launch.dialog.setInstructions}
					onUseWorktreeChange={launch.dialog.setUseWorktree}
					onExecutionModeChange={launch.dialog.setExecutionMode}
					onLaunch={launch.confirm}
					onClose={launch.close}
				/>
			) : null}
		</>
	)
}
