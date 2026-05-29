import { AgentPicker } from '@/components/launch/AgentPicker'
import { DialogPopup } from '@/components/ui/dialog-shell'
import { LAUNCH_STEP_KIND_LABEL } from '@/lib/domain'
import type { Agent, ExecutionMode, LaunchProfile, LaunchStepKind } from '@/types'
import type { SKIconName } from '@/types/icons'
import { Btn } from '@/ui/Btn'
import { Icon } from '@/ui/Icon'
import { Toggle } from '@/ui/Toggle'
import { Dialog } from '@base-ui/react/dialog'

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
	profile: LaunchProfile
	instructions: string
	useWorktree: boolean
	executionMode: ExecutionMode
	isPending: boolean
	agents: readonly Agent[]
	selection: AgentSelection
	agentsLoading?: boolean
	onAgentChange: (kind: LaunchStepKind, name: string) => void
	onInstructionsChange: (value: string) => void
	onUseWorktreeChange: (value: boolean) => void
	onExecutionModeChange: (value: ExecutionMode) => void
	onLaunch: () => void
	onClose: () => void
}

const PLACEHOLDER = `Ex: Read the full Linear issue before starting. Use a worktree.
Run just check before finishing. Don't push, provide test instructions.
Focus only on the API crate for this ticket.`

export function LaunchDialog({
	open,
	profile,
	instructions,
	useWorktree,
	executionMode,
	isPending,
	agents,
	selection,
	agentsLoading,
	onAgentChange,
	onInstructionsChange,
	onUseWorktreeChange,
	onExecutionModeChange,
	onLaunch,
	onClose
}: LaunchDialogProps) {
	const worktreeHint = profile.use_worktree ? 'Run in an isolated worktree' : 'Use the current checkout'
	return (
		<Dialog.Root
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) onClose()
			}}
		>
			<DialogPopup popupClassName="dialog">
				<div className="dialog__head">
					<Icon name="zap" size={18} className="ic" />
					<Dialog.Title className="dialog__title">Launch agent</Dialog.Title>
					<span className="spacer" />
					<Dialog.Close className="iconbtn" aria-label="Close">
						<Icon name="x" size={16} className="ic" />
					</Dialog.Close>
				</div>

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
						<span className="field__label">Execution mode</span>
						<div className="seg">
							<button
								type="button"
								className={executionMode === 'full_auto' ? 'on' : undefined}
								onClick={() => onExecutionModeChange('full_auto')}
							>
								Full-auto
							</button>
							<button
								type="button"
								className={executionMode === 'semi_auto' ? 'on' : undefined}
								onClick={() => onExecutionModeChange('semi_auto')}
							>
								Semi-auto
							</button>
						</div>
						{executionMode === 'semi_auto' ? (
							<div
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 'var(--space-3)',
									marginTop: 'var(--space-2)',
									fontSize: 'var(--text-12)',
									color: 'var(--status-needs)'
								}}
							>
								<Icon name="alert" size={13} className="ic" />
								Pauses for your approval after each step
							</div>
						) : null}
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

					<div className="field">
						<span className="field__label">
							Operator instructions{' '}
							<span style={{ color: 'var(--fg-dim)', fontWeight: 400 }}>· optional</span>
						</span>
						<textarea
							className="textarea"
							rows={4}
							value={instructions}
							onChange={(e) => onInstructionsChange(e.target.value)}
							placeholder={PLACEHOLDER}
							aria-label="Operator instructions"
						/>
					</div>
				</div>

				<div className="dialog__foot">
					<span className="hint">⌘↵ to launch</span>
					<span className="spacer" />
					<Btn kind="ghost" size="sm" onClick={onClose}>
						Cancel
					</Btn>
					<Btn kind="primary" size="sm" icon="play" disabled={isPending} onClick={onLaunch}>
						{isPending ? 'Launching…' : 'Launch'}
					</Btn>
				</div>
			</DialogPopup>
		</Dialog.Root>
	)
}
