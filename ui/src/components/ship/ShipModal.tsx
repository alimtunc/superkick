import { useState } from 'react'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DialogPopup } from '@/components/ui/dialog-shell'
import { useLinearOptions } from '@/hooks/useLinearOptions'
import { useShipLaunchTask } from '@/hooks/useShipLaunchTask'
import { resolveLinearStatusStateId } from '@/lib/ship'
import type { IssueDetailResponse, WorkflowStateOption } from '@/types'
import { Btn } from '@/ui/Btn'
import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import { toast } from 'sonner'

import { LINEAR_STATUS_OPTIONS, SHIP_MODE_OPTIONS, SHIP_MODE_SUBMIT_LABEL } from './shipOptions'
import { useShipForm } from './useShipForm'

interface ShipModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	issue: IssueDetailResponse
	taskId: string
	runId: string
	baseBranch: string | null
	headBranch: string | null
	prExists?: boolean
	defaultTitle: string
	summary: string
	changedFiles: readonly string[]
}

const HEAD_BRANCH_LOCKED_ID = 'ship-head-branch-locked'
const HEAD_BRANCH_ERROR_ID = 'ship-head-branch-error'

function headBranchDescribedBy(prExists: boolean, hasError: boolean): string | undefined {
	if (prExists) return HEAD_BRANCH_LOCKED_ID
	if (hasError) return HEAD_BRANCH_ERROR_ID
	return undefined
}

function pillClass(active: boolean, disabled: boolean): string {
	const base = 'rounded-md border px-2.5 py-1 text-[12px] transition-colors'
	if (disabled) return `${base} cursor-not-allowed border-border text-fg-dim opacity-50`
	if (active) return `${base} border-accent bg-accent-soft text-fg`
	return `${base} border-border text-fg-muted hover:border-border-strong`
}

export function ShipModal({
	open,
	onOpenChange,
	issue,
	taskId,
	runId,
	baseBranch,
	headBranch,
	prExists = false,
	defaultTitle,
	summary,
	changedFiles
}: ShipModalProps) {
	const form = useShipForm({ open, defaultTitle, summary, changedFiles, headBranch })
	const { data: options } = useLinearOptions()
	const mutation = useShipLaunchTask({ issueId: issue.id, taskId, runId, teamId: issue.team_id })
	const [confirmReady, setConfirmReady] = useState(false)

	const states: WorkflowStateOption[] =
		issue.team_id && options ? (options.workflow_states_by_team[issue.team_id] ?? []) : []
	const linearEnabled = issue.team_id !== null && states.length > 0
	const canInReview = resolveLinearStatusStateId(states, 'in_review') !== null
	const canDone = resolveLinearStatusStateId(states, 'done') !== null
	const statusDisabled: Record<string, boolean> = {
		no_change: false,
		in_review: !canInReview,
		done: !canDone
	}

	const isPr = form.mode !== 'push_only'
	const busy = mutation.isPending
	const headBranchError = prExists ? null : form.headBranchError
	const canSubmit = !busy && (!isPr || form.title.trim().length > 0) && headBranchError === null

	const submit = () => {
		mutation.mutate(
			{
				mode: form.mode,
				title: form.title.trim(),
				body: isPr ? form.body : '',
				headBranch: prExists ? null : form.headBranchOverride,
				comment: form.comment.trim() ? form.comment.trim() : null,
				statusStateId: resolveLinearStatusStateId(states, form.statusChoice)
			},
			{
				onSuccess: (res) => {
					onOpenChange(false)
					toast.success(
						res.pr
							? `PR #${res.pr.number} ${res.pr.state === 'draft' ? 'drafted' : 'opened'}`
							: `Pushed ${res.pushedBranch}`
					)
				}
			}
		)
	}

	const onShipClick = () => {
		if (form.mode === 'ready') {
			setConfirmReady(true)
			return
		}
		submit()
	}

	return (
		<>
			<Dialog.Root
				open={open}
				onOpenChange={(next) => {
					if (!next) onOpenChange(false)
				}}
			>
				<DialogPopup popupClassName="dialog on-raised" align="top">
					<div className="dialog__head">
						<Dialog.Title className="dialog__title">Ship · {issue.identifier}</Dialog.Title>
						<span className="spacer" />
						<Dialog.Close className="iconbtn" aria-label="Close">
							<X size={14} strokeWidth={1.75} aria-hidden="true" className="ic" />
						</Dialog.Close>
					</div>

					<div className="dialog__body" style={{ gap: 'var(--space-4)' }}>
						<fieldset className="flex flex-col gap-1.5" disabled={busy}>
							<legend className="mb-1 text-[11px] tracking-wide text-fg-dim uppercase">
								Pull request
							</legend>
							{SHIP_MODE_OPTIONS.map((opt) => (
								<label key={opt.value} className="flex cursor-pointer items-center gap-2">
									<input
										type="radio"
										name="ship-mode"
										aria-label={opt.label}
										checked={form.mode === opt.value}
										onChange={() => form.setMode(opt.value)}
										className="accent-accent"
									/>
									<span className="text-[12.5px] text-fg">{opt.label}</span>
									<span className="text-[11px] text-fg-dim">— {opt.hint}</span>
								</label>
							))}
						</fieldset>

						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2 rounded-md border border-border bg-canvas px-3 py-2 text-[11.5px]">
								<span className="text-fg-dim">base</span>
								<span className="font-mono text-fg">{baseBranch ?? 'main'}</span>
								<span aria-hidden="true" className="text-fg-dim">
									←
								</span>
								<span className="text-fg-dim">head</span>
								<input
									type="text"
									value={form.headBranch}
									onChange={(event) => form.setHeadBranch(event.target.value)}
									placeholder="(run branch)"
									disabled={prExists || busy}
									aria-label="Head branch"
									aria-invalid={headBranchError !== null}
									aria-describedby={headBranchDescribedBy(
										prExists,
										headBranchError !== null
									)}
									className="min-w-0 flex-1 rounded-sm border border-border bg-input px-2 py-0.5 font-mono text-[11.5px] text-fg outline-none placeholder:text-fg-dim focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
								/>
							</div>
							{prExists ? (
								<span id={HEAD_BRANCH_LOCKED_ID} className="text-[11px] text-fg-dim">
									Head branch is locked — a PR already exists for this run.
								</span>
							) : null}
							{headBranchError !== null ? (
								<span id={HEAD_BRANCH_ERROR_ID} className="text-[11px] text-danger">
									{headBranchError}
								</span>
							) : null}
						</div>

						{isPr ? (
							<div className="flex flex-col gap-2">
								<input
									type="text"
									value={form.title}
									onChange={(event) => form.setTitle(event.target.value)}
									placeholder="PR title"
									className="input text-[13px] font-medium"
									aria-label="PR title"
								/>
								<div className="flex flex-wrap gap-3">
									<label className="flex items-center gap-1.5 text-[12px] text-fg">
										<input
											type="checkbox"
											aria-label="Include summary"
											checked={form.includeSummary}
											disabled={summary.trim().length === 0}
											onChange={(event) => form.setIncludeSummary(event.target.checked)}
											className="accent-accent"
										/>
										Include summary
									</label>
									<label className="flex items-center gap-1.5 text-[12px] text-fg">
										<input
											type="checkbox"
											aria-label="Include changed files"
											checked={form.includeChangedFiles}
											disabled={changedFiles.length === 0}
											onChange={(event) =>
												form.setIncludeChangedFiles(event.target.checked)
											}
											className="accent-accent"
										/>
										Include changed files
									</label>
								</div>
								<textarea
									value={form.body}
									onChange={(event) => form.setBody(event.target.value)}
									rows={6}
									placeholder="PR description"
									className="textarea resize-y leading-relaxed"
									aria-label="PR description"
								/>
							</div>
						) : null}

						<div className="flex flex-col gap-2 border-t border-border pt-3">
							<span className="text-[11px] tracking-wide text-fg-dim uppercase">Linear</span>
							{linearEnabled ? (
								<>
									<textarea
										value={form.comment}
										onChange={(event) => form.setComment(event.target.value)}
										rows={2}
										placeholder="Add a comment to the Linear issue (optional)"
										className="textarea resize-y"
										aria-label="Linear comment"
									/>
									<div className="flex items-center gap-1.5">
										<span className="mr-1 text-[12px] text-fg-dim">Status</span>
										{LINEAR_STATUS_OPTIONS.map((opt) => (
											<button
												key={opt.value}
												type="button"
												disabled={statusDisabled[opt.value]}
												aria-pressed={form.statusChoice === opt.value}
												className={pillClass(
													form.statusChoice === opt.value,
													statusDisabled[opt.value]
												)}
												onClick={() => form.setStatusChoice(opt.value)}
											>
												{opt.label}
											</button>
										))}
									</div>
								</>
							) : (
								<p className="text-[12px] text-fg-muted">
									Linear is not configured for this issue — comment and status updates are
									unavailable.
								</p>
							)}
						</div>
					</div>

					<div className="dialog__foot">
						<span className="spacer" />
						<Btn kind="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
							Cancel
						</Btn>
						<Btn kind="primary" size="sm" onClick={onShipClick} disabled={!canSubmit}>
							{busy ? 'Shipping…' : SHIP_MODE_SUBMIT_LABEL[form.mode]}
						</Btn>
					</div>
				</DialogPopup>
			</Dialog.Root>

			<ConfirmDialog
				open={confirmReady}
				onOpenChange={setConfirmReady}
				title="Open a ready PR?"
				description="This opens a ready-for-review pull request. Reviewers will be notified."
				confirmLabel="Open ready PR"
				busy={busy}
				onConfirm={() => {
					setConfirmReady(false)
					submit()
				}}
			/>
		</>
	)
}
