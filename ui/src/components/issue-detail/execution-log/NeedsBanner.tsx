import { useState } from 'react'

import { ISSUE_REPLY_COMPOSER_ID } from '@/components/issue-detail/IssueReplyComposer'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useCancelLaunchTask, useRetryLaunchTask } from '@/hooks/useLaunchTaskActions'
import type { BlockingContext } from '@/types'
import { AlertTriangle, Check, MessageCircle, X } from 'lucide-react'

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
			className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-warn/40 bg-warn-soft/60 px-3 py-2"
		>
			<span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-warn">
				<AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" />
				{blocking.headline}
			</span>
			<span className="min-w-0 truncate text-[12px] text-fg-muted">{blocking.hint}</span>
			<div className="ml-auto flex flex-wrap items-center gap-1.5">
				<button
					type="button"
					onClick={() => retry.mutate()}
					disabled={retry.isPending}
					className="font-data inline-flex h-7 items-center gap-1 rounded-md bg-warn px-2.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-warn/40 focus-visible:outline-none disabled:opacity-60"
				>
					<Check size={12} strokeWidth={2} aria-hidden="true" />
					Approve
				</button>
				<button
					type="button"
					onClick={() => setConfirmReject(true)}
					disabled={cancel.isPending}
					className="font-data inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-[12px] text-fg transition-colors hover:bg-raised focus-visible:ring-2 focus-visible:ring-warn/40 focus-visible:outline-none disabled:opacity-60"
				>
					<X size={12} strokeWidth={2} aria-hidden="true" />
					Reject
				</button>
				<button
					type="button"
					onClick={focusReplyComposer}
					className="font-data inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-fg-muted transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-warn/40 focus-visible:outline-none"
				>
					<MessageCircle size={12} strokeWidth={1.9} aria-hidden="true" />
					Comment
				</button>
				<span className="text-[11px] text-fg-dim">Your decision is logged to the run.</span>
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
