import { LaunchDialog } from '@/components/launch/LaunchDialog'
import { useConfig } from '@/hooks/useConfig'
import { useLaunchFromInbox } from '@/hooks/useLaunchFromInbox'
import { Btn, Icon } from '@/ui'

interface ExecutionLogIdleProps {
	issueIdentifier: string
}

export function ExecutionLogIdle({ issueIdentifier }: ExecutionLogIdleProps) {
	const { config } = useConfig()
	const launchProfile = config?.launch_profile
	const launch = useLaunchFromInbox({ launchProfile })

	return (
		<section aria-label="No execution yet" className="execlog">
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 'var(--space-5)',
					padding: 'var(--space-7) var(--space-6)'
				}}
			>
				<div className="empty-state__icon" style={{ width: 36, height: 36 }}>
					<Icon name="zap" size={18} className="ic" />
				</div>
				<div style={{ flex: 1 }}>
					<div style={{ fontSize: 'var(--text-13)', fontWeight: 'var(--fw-medium)' }}>
						No execution yet on this issue.
					</div>
					<div style={{ fontSize: 'var(--text-12)', color: 'var(--fg-dim)', marginTop: 2 }}>
						Launch the plan → implement → review recipe against this issue.
					</div>
				</div>
				<Btn
					kind="primary"
					size="sm"
					icon="play"
					disabled={!launchProfile}
					onClick={() => launch.openFor(issueIdentifier)}
				>
					Launch task
				</Btn>
			</div>
			{launchProfile ? (
				<LaunchDialog
					open={launch.dialog.open}
					profile={launchProfile}
					instructions={launch.dialog.instructions}
					useWorktree={launch.dialog.useWorktree}
					executionMode={launch.dialog.executionMode}
					isPending={launch.isPending}
					agents={launch.agents}
					selection={launch.selection}
					agentsLoading={launch.agentsLoading}
					onAgentChange={launch.setAgent}
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
