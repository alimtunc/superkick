import { LaunchDialog } from '@/components/launch/LaunchDialog'
import { useConfig } from '@/hooks/useConfig'
import { useLaunchFromInbox } from '@/hooks/useLaunchFromInbox'
import { Btn } from '@/ui'
import { Zap } from 'lucide-react'

interface ExecutionLogIdleProps {
	issueIdentifier: string
}

export function ExecutionLogIdle({ issueIdentifier }: ExecutionLogIdleProps) {
	const { config } = useConfig()
	const launchProfile = config?.launch_profile
	const launch = useLaunchFromInbox({ launchProfile })

	return (
		<section
			aria-label="No execution yet"
			className="flex items-center gap-2.5 rounded-[10px] border border-border bg-surface px-4.5 py-4"
		>
			<Zap size={13} strokeWidth={1.85} className="text-fg-dim" aria-hidden="true" />
			<span className="text-[12.5px] text-fg-muted">No execution yet on this issue.</span>
			<Btn
				kind="primary"
				size="sm"
				icon="zap"
				className="ml-auto"
				disabled={!launchProfile}
				onClick={() => launch.openFor(issueIdentifier)}
			>
				Launch task
			</Btn>
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
		</section>
	)
}
