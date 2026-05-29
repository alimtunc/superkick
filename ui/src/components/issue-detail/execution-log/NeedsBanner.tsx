import { useState } from 'react'

import { ISSUE_REPLY_COMPOSER_ID } from '@/components/issue-detail/IssueReplyComposer'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useCancelLaunchTask, useRetryLaunchTask } from '@/hooks/useLaunchTaskActions'
import type { BlockingContext } from '@/types'
import { Btn } from '@/ui'
import { AlertTriangle } from 'lucide-react'

interface NeedsBannerProps {
	linearIssueId: string
	taskId: string
	linkedRunId: string | null
	blocking: BlockingContext
}

function focusReplyComposer() {
	const node = document.getElementById(ISSUE_REPLY_COMPOSER_ID)
	if (!node) return
	node.scrollIntoView({ behavior: 'smooth', block: 'center' })
	const textarea = node.querySelector('textarea')
	if (textarea instanceof HTMLTextAreaElement && !textarea.disabled) {
		textarea.focus()
	}
}

export function NeedsBanner({ linearIssueId, taskId, linkedRunId, blocking }: NeedsBannerProps) {
	const retry = useRetryLaunchTask({ linearIssueId, taskId })
	const cancel = useCancelLaunchTask({
		linearIssueId,
		taskId,
		linkedRunId: linkedRunId ?? undefined
	})
	const [confirmReject, setConfirmReject] = useState(false)

	return (
		<section
			aria-label="Needs your decision"
			className="flex flex-col gap-1.5 border-b border-[color-mix(in_srgb,var(--color-warn)_30%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-warn)_10%,var(--color-surface))] px-3.5 py-2.5"
		>
			<div className="flex flex-wrap items-center gap-2.5">
				<span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-warn">
					<AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" />
					{blocking.headline}
				</span>
				<span className="min-w-0 truncate text-[12px] text-fg-muted">{blocking.hint}</span>
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				<Btn
					kind="primary"
					size="sm"
					icon="check"
					onClick={() => retry.mutate()}
					disabled={retry.isPending}
				>
					Approve
				</Btn>
				<Btn
					kind="secondary"
					size="sm"
					icon="x"
					onClick={() => setConfirmReject(true)}
					disabled={cancel.isPending}
				>
					Reject
				</Btn>
				<Btn kind="ghost" size="sm" icon="comment" onClick={focusReplyComposer}>
					Comment
				</Btn>
				<span className="ml-auto text-[11px] text-fg-dim">Decision logs to the run.</span>
			</div>
			<ConfirmDialog
				open={confirmReject}
				onOpenChange={setConfirmReject}
				title="Reject this task?"
				description="The current step will be cancelled. Already-completed work is preserved."
				confirmLabel="Reject"
				cancelLabel="Keep waiting"
				destructive
				busy={cancel.isPending}
				onConfirm={() => {
					cancel.mutate(undefined, { onSettled: () => setConfirmReject(false) })
				}}
			/>
		</section>
	)
}
