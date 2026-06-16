import { ConfirmDialog } from '@/components/composites/confirm-dialog'
import { Button, Textarea } from '@/components/primitives'
import { SettingsRow } from '@/domains/settings/components/SettingsRow'
import { SettingsSection } from '@/domains/settings/components/SettingsSection'
import { useRunnerConfigForm } from '@/hooks/useRunnerConfigForm'
import { restartConfirmDescription } from '@/lib/runnerConfig'
import type { RunnerConfigResponse } from '@/types'

interface RunnerConfigFormProps {
	config: RunnerConfigResponse
}

export function RunnerConfigForm({ config }: RunnerConfigFormProps) {
	const form = useRunnerConfigForm(config)

	return (
		<>
			<SettingsSection title="Worktrees">
				<SettingsRow label="Worktree prefix" hint="Directory prefix for run worktrees">
					<div className="flex w-64 flex-col items-stretch gap-1">
						<input
							type="text"
							className="input text-[13px]"
							value={form.worktreePrefix}
							aria-label="Worktree prefix"
							aria-invalid={form.errors.worktreePrefix !== null}
							onChange={(event) => form.setWorktreePrefix(event.target.value)}
						/>
						{form.errors.worktreePrefix !== null ? (
							<span className="text-[11px] text-danger">{form.errors.worktreePrefix}</span>
						) : null}
					</div>
				</SettingsRow>
				<SettingsRow label="Base branch" hint="Branch new run worktrees start from" last>
					<div className="flex w-64 flex-col items-stretch gap-1">
						<input
							type="text"
							className="input text-[13px]"
							value={form.baseBranch}
							aria-label="Base branch"
							aria-invalid={form.errors.baseBranch !== null}
							onChange={(event) => form.setBaseBranch(event.target.value)}
						/>
						{form.errors.baseBranch !== null ? (
							<span className="text-[11px] text-danger">{form.errors.baseBranch}</span>
						) : null}
					</div>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection title="Setup commands">
				<SettingsRow
					label="Commands"
					hint="One command per line, run after the worktree is created"
					last
				>
					<div className="w-80">
						<Textarea
							rows={4}
							className="resize-y font-mono text-[12px]"
							value={form.setupCommandsText}
							aria-label="Setup commands"
							onChange={(event) => form.setSetupCommandsText(event.target.value)}
						/>
					</div>
				</SettingsRow>
			</SettingsSection>

			<div className="flex items-center justify-end gap-3">
				{form.requiresRestart ? (
					<span className="text-[12px] text-fg-muted">
						Restart the daemon to apply runner changes.
					</span>
				) : null}
				{form.requiresRestart && form.desktop ? (
					<Button
						variant="outline"
						size="sm"
						disabled={form.restarting}
						onClick={() => void form.requestRestart()}
					>
						Restart now
					</Button>
				) : null}
				<Button
					size="sm"
					disabled={!form.dirty || !form.valid || form.saving || form.restarting}
					onClick={form.save}
				>
					{form.saving ? 'Saving…' : 'Save'}
				</Button>
			</div>

			<ConfirmDialog
				open={form.restartConfirm !== null}
				onOpenChange={(open) => {
					if (!open) form.cancelRestart()
				}}
				title="Restart the daemon?"
				description={restartConfirmDescription(form.restartConfirm?.activeRuns ?? null)}
				confirmLabel="Restart"
				destructive
				busy={form.restarting}
				onConfirm={() => void form.confirmRestart()}
			/>
		</>
	)
}
