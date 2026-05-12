import { Btn } from '@/ui/Btn'
import { Kbd } from '@/ui/Kbd'

export function IssueReplyComposer({ disabledHint }: { disabledHint?: string }) {
	const hint = disabledHint ?? 'Issue replies will land here in a follow-up.'
	return (
		<div className="rounded-lg border border-border bg-surface">
			<textarea
				disabled
				placeholder={hint}
				rows={3}
				className="font-data block w-full resize-none rounded-t-lg bg-transparent px-3.5 py-3 text-[13px] text-fg placeholder:text-fg-dim focus:outline-none disabled:cursor-not-allowed"
				aria-label="Reply to issue"
			/>
			<div className="flex items-center justify-between gap-2 border-t border-border bg-canvas/40 px-3 py-2">
				<div className="flex items-center gap-1.5">
					<Btn kind="ghost" size="sm" icon="copy" disabled aria-label="Attach file">
						Attach
					</Btn>
				</div>
				<div className="flex items-center gap-2 text-[11px] text-fg-dim">
					<span className="inline-flex items-center gap-1">
						<Kbd>⌘</Kbd>
						<Kbd>↵</Kbd>
						<span>to send</span>
					</span>
					<Btn kind="primary" size="sm" icon="send" disabled>
						Send
					</Btn>
				</div>
			</div>
		</div>
	)
}
