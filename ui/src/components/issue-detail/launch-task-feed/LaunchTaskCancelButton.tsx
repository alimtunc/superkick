import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useCancelLaunchTask } from '@/hooks/useLaunchTaskActions'
import { CircleStop } from 'lucide-react'

interface LaunchTaskCancelButtonProps {
	linearIssueId: string
	taskId: string
	linkedRunId?: string
}

export function LaunchTaskCancelButton({ linearIssueId, taskId, linkedRunId }: LaunchTaskCancelButtonProps) {
	const [confirmOpen, setConfirmOpen] = useState(false)
	const cancel = useCancelLaunchTask({ linearIssueId, taskId, linkedRunId })

	return (
		<>
			<Button
				variant="ghost"
				size="xs"
				onClick={() => setConfirmOpen(true)}
				disabled={cancel.isPending}
				className="font-data text-[11px] text-dim hover:text-oxide"
			>
				<CircleStop size={12} strokeWidth={1.75} aria-hidden="true" />
				Cancel
			</Button>
			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title="Cancel launch task?"
				description="The current step will be aborted and the task will move to Cancelled. Already-completed work is preserved."
				confirmLabel="Cancel task"
				cancelLabel="Keep running"
				destructive
				busy={cancel.isPending}
				onConfirm={() => {
					cancel.mutate(undefined, {
						onSettled: () => setConfirmOpen(false)
					})
				}}
			/>
		</>
	)
}
