import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { AlertDialog } from '@base-ui/react/alert-dialog'

interface ConfirmDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	description?: ReactNode
	confirmLabel?: string
	cancelLabel?: string
	destructive?: boolean
	busy?: boolean
	onConfirm: () => void
}

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel = 'Confirm',
	cancelLabel = 'Cancel',
	destructive = false,
	busy = false,
	onConfirm
}: ConfirmDialogProps) {
	return (
		<AlertDialog.Root open={open} onOpenChange={onOpenChange}>
			<AlertDialog.Portal>
				<AlertDialog.Backdrop className="fixed inset-0 z-50 bg-carbon/70 backdrop-blur-sm transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
				<AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-edge bg-carbon p-5 shadow-xl transition-all duration-150 outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
					<AlertDialog.Title className="text-[14px] font-semibold text-fog">
						{title}
					</AlertDialog.Title>
					{description ? (
						<AlertDialog.Description className="font-data mt-2 text-[12px] leading-snug text-silver/80">
							{description}
						</AlertDialog.Description>
					) : null}
					<div className="mt-5 flex justify-end gap-2">
						<AlertDialog.Close
							render={
								<Button
									variant="ghost"
									size="xs"
									disabled={busy}
									className="font-data text-[11px] text-dim hover:text-silver"
								>
									{cancelLabel}
								</Button>
							}
						/>
						<Button
							variant={destructive ? 'destructive' : 'default'}
							size="xs"
							onClick={onConfirm}
							disabled={busy}
							className="font-data text-[11px]"
						>
							{busy ? '...' : confirmLabel}
						</Button>
					</div>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	)
}
