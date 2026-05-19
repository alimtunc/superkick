import { ModeButton } from '@/components/launch/ModeButton'
import { ProfileFlags } from '@/components/launch/ProfileFlags'
import { Button } from '@/components/ui/button'
import { DialogPopup } from '@/components/ui/dialog-shell'
import { Switch } from '@/components/ui/switch'
import type { ExecutionMode, LaunchProfile } from '@/types'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'

interface LaunchDialogProps {
	open: boolean
	profile: LaunchProfile
	instructions: string
	useWorktree: boolean
	executionMode: ExecutionMode
	isPending: boolean
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
	onInstructionsChange,
	onUseWorktreeChange,
	onExecutionModeChange,
	onLaunch,
	onClose
}: LaunchDialogProps) {
	return (
		<Dialog.Root
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) onClose()
			}}
		>
			<DialogPopup popupClassName="panel w-full max-w-xl p-5">
				<div className="mb-4 flex items-center justify-between">
					<Dialog.Title className="font-data text-sm font-medium text-silver">
						LAUNCH RUN
					</Dialog.Title>
					<Dialog.Close
						className="inline-flex size-6 items-center justify-center rounded-md text-dim transition-colors hover:bg-edge hover:text-silver focus-visible:ring-2 focus-visible:ring-mineral/40 focus-visible:outline-none"
						aria-label="Close"
					>
						<X size={14} strokeWidth={1.75} aria-hidden="true" />
					</Dialog.Close>
				</div>

				<ProfileFlags profile={profile} />

				<div className="mt-4">
					<span className="font-data mb-1.5 block text-[10px] tracking-wider text-dim uppercase">
						EXECUTION MODE
					</span>
					<div className="flex gap-2">
						<ModeButton
							mode="full_auto"
							label="FULL AUTO"
							description="Autonomous — interrupts only on failure"
							selected={executionMode === 'full_auto'}
							onSelect={onExecutionModeChange}
						/>
						<ModeButton
							mode="semi_auto"
							label="SEMI AUTO"
							description="Pauses after plan for operator review"
							selected={executionMode === 'semi_auto'}
							onSelect={onExecutionModeChange}
						/>
					</div>
				</div>

				<label className="mt-4 block">
					<span className="font-data mb-1.5 block text-[10px] tracking-wider text-dim uppercase">
						INSTRUCTIONS
					</span>
					<textarea
						value={instructions}
						onChange={(e) => onInstructionsChange(e.target.value)}
						rows={8}
						className="font-data w-full resize-y rounded border border-edge bg-carbon px-3 py-2 text-[12px] leading-relaxed text-silver placeholder:text-dim/60 focus:border-edge-bright focus:outline-none"
						placeholder={PLACEHOLDER}
					/>
				</label>

				<div className="mt-5 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Switch
							checked={useWorktree}
							onCheckedChange={onUseWorktreeChange}
							aria-label="Use worktree"
						/>
						<span className="font-data text-[11px] text-dim">Use worktree</span>
					</div>

					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={onClose}
							className="font-data text-[11px]"
						>
							CANCEL
						</Button>
						<Button
							size="sm"
							disabled={isPending}
							onClick={onLaunch}
							className="font-data text-[11px]"
						>
							{isPending ? 'LAUNCHING...' : 'LAUNCH'}
						</Button>
					</div>
				</div>
			</DialogPopup>
		</Dialog.Root>
	)
}
