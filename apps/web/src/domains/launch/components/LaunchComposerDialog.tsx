import { DialogPopup } from '@/components/composites/dialog-shell'
import { Icon } from '@/components/primitives'
import { LaunchComposer } from '@/domains/launch/components/LaunchComposer'
import type { IssueDetailResponse, LaunchTaskWithSteps } from '@/types'
import { Dialog } from '@base-ui/react/dialog'

interface LaunchComposerDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	issue: IssueDetailResponse | null
	prefill?: string | null
	title?: string
	onLaunched: (result: LaunchTaskWithSteps) => void
}

export function LaunchComposerDialog({
	open,
	onOpenChange,
	issue,
	prefill = null,
	title = 'Launch task',
	onLaunched
}: LaunchComposerDialogProps) {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<DialogPopup
				align="center"
				popupClassName="flex max-h-[86vh] w-[760px] max-w-[94vw] flex-col overflow-hidden rounded-[14px] border border-border-strong bg-overlay shadow-lg"
			>
				<div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-3.5">
					<Icon name="zap" size={18} className="ic" />
					<Dialog.Title className="text-[15px] font-semibold text-fg">{title}</Dialog.Title>
					<span className="flex-1" />
					<Dialog.Close className="iconbtn" aria-label="Close">
						<Icon name="x" size={16} className="ic" />
					</Dialog.Close>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto">
					<LaunchComposer issue={issue} prefill={prefill} onLaunched={onLaunched} />
				</div>
			</DialogPopup>
		</Dialog.Root>
	)
}
