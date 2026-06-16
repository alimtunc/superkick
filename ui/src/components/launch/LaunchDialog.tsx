import { AgentPicker } from '@/components/launch/AgentPicker'
import { DialogShell } from '@/components/ui/dialog-shell'
import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import type { Agent, LaunchProfileSettings, LaunchStepKind } from '@/types'
import type { SKIconName } from '@/types/icons'
import { Btn } from '@/ui/Btn'
import { Icon } from '@/ui/Icon'
import { Toggle } from '@/ui/Toggle'

type AgentSelection = Record<LaunchStepKind, string | null>

interface RecipeStepDescriptor {
	kind: LaunchStepKind
	label: string
	icon: SKIconName
}

const RECIPE_STEPS: readonly RecipeStepDescriptor[] = [
	{ kind: 'plan', label: 'planner', icon: 'doc' },
	{ kind: 'implement', label: 'coder', icon: 'bot' },
	{ kind: 'review', label: 'reviewer', icon: 'check' }
]

interface LaunchDialogProps {
	open: boolean
	profile: LaunchProfileSettings
	useWorktree: boolean
	isPending: boolean
	canLaunch: boolean
	agents: readonly Agent[]
	selection: AgentSelection
	agentsLoading?: boolean
	onAgentChange: (kind: LaunchStepKind, name: string) => void
	onUseWorktreeChange: (value: boolean) => void
	onLaunch: () => void
	onClose: () => void
}

export function LaunchDialog({
	open,
	profile,
	useWorktree,
	isPending,
	canLaunch,
	agents,
	selection,
	agentsLoading,
	onAgentChange,
	onUseWorktreeChange,
	onLaunch,
	onClose
}: LaunchDialogProps) {
	const worktreeHint = profile.use_worktree ? 'Run in an isolated worktree' : 'Use the current checkout'
	return (
		<DialogShell
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) onClose()
			}}
			popupClassName="dialog"
			icon={<Icon name="zap" size={18} className="ic" />}
			title="Launch agent"
			footer={
				<>
					<span className="hint">⌘↵ to launch</span>
					<span className="spacer" />
					<Btn kind="ghost" size="sm" onClick={onClose}>
						Cancel
					</Btn>
					<Btn
						kind="primary"
						size="sm"
						icon="play"
						disabled={isPending || !canLaunch}
						onClick={onLaunch}
					>
						{isPending ? 'Launching…' : 'Launch'}
					</Btn>
				</>
			}
		>
			<div className="dialog__body">
				<div className="field">
					<span className="field__label">Recipe · plan → implement → review</span>
					<div
						style={{
							background: 'var(--bg-app)',
							border: '1px solid var(--border)',
							borderRadius: 'var(--radius-md)',
							padding: '0 var(--space-5)'
						}}
					>
						{RECIPE_STEPS.map((step, index) => (
							<div key={step.kind} className="step-pick">
								<span className="step-pick__kind">
									<span className="n">{index + 1}</span>
									{LAUNCH_STEP_KIND_LABEL[step.kind]}
								</span>
								<AgentPicker
									value={selection[step.kind]}
									agents={agents}
									onChange={(name) => onAgentChange(step.kind, name)}
									recommendedFor={step.kind}
									icon={step.icon}
									label={step.label}
									disabled={agentsLoading}
								/>
							</div>
						))}
					</div>
				</div>

				<div className="field">
					<Toggle
						checked={useWorktree}
						onChange={onUseWorktreeChange}
						ariaLabel="Use worktree"
						label={
							<>
								{worktreeHint}{' '}
								<span style={{ color: 'var(--fg-dim)' }}>· ~/.superkick/wt</span>
							</>
						}
					/>
				</div>
			</div>
		</DialogShell>
	)
}
