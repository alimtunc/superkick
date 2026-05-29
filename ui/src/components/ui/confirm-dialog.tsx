import type { ReactNode } from 'react'

import { Icon } from '@/ui/Icon'
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
				<AlertDialog.Backdrop className="fixed inset-0 z-overlay bg-(--bg-scrim) transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
				<AlertDialog.Popup className="dialog dialog--confirm fixed top-1/2 left-1/2 z-dialog -translate-x-1/2 -translate-y-1/2 transition-all duration-150 outline-none data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
					<div className="dialog__body" style={{ gap: 'var(--space-4)' }}>
						<div className="flex items-center gap-2">
							<span style={{ color: destructive ? 'var(--danger)' : 'var(--accent)' }}>
								<Icon name="alert" size={20} />
							</span>
							<AlertDialog.Title className="dialog__title">{title}</AlertDialog.Title>
						</div>
						{description ? (
							<AlertDialog.Description
								className="m-0 text-[13px] text-fg-muted"
								style={{ lineHeight: 'var(--lh-normal)' }}
							>
								{description}
							</AlertDialog.Description>
						) : null}
					</div>
					<div className="dialog__foot">
						<span className="spacer" />
						<AlertDialog.Close
							render={
								<button type="button" className="btn btn--ghost btn--sm" disabled={busy}>
									{cancelLabel}
								</button>
							}
						/>
						<button
							type="button"
							className={destructive ? 'btn btn--danger btn--sm' : 'btn btn--primary btn--sm'}
							onClick={onConfirm}
							disabled={busy}
						>
							{busy ? '…' : confirmLabel}
						</button>
					</div>
				</AlertDialog.Popup>
			</AlertDialog.Portal>
		</AlertDialog.Root>
	)
}
