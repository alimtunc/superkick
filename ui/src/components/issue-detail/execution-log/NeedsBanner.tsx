import { useState } from 'react'

import { ISSUE_REPLY_COMPOSER_ID } from '@/components/issue-detail/IssueReplyComposer'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useCancelLaunchTask, useRetryLaunchTask } from '@/hooks/useLaunchTaskActions'
import type { BlockingContext } from '@/types'
import { Btn, Icon } from '@/ui'

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
		<section aria-label="Needs your decision" className="opbanner">
			<span className="opbanner__icon">
				<Icon name="alert" size={18} className="ic" />
			</span>
			<div className="opbanner__body">
				<p className="opbanner__title">{blocking.headline}</p>
				<p className="opbanner__q">{blocking.hint}</p>
				<div className="opbanner__actions">
					<Btn
						kind="success"
						size="sm"
						icon="check"
						onClick={() => retry.mutate('fix_forward')}
						disabled={retry.isPending}
					>
						Approve
					</Btn>
					<Btn
						kind="danger"
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
				</div>
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
