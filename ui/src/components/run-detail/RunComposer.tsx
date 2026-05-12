import { useWorkspaceChatStore } from '@/stores/workspaceChat'
import { Btn } from '@/ui/Btn'
import { Kbd } from '@/ui/Kbd'

interface RunComposerProps {
	disabled: boolean
}

export function RunComposer({ disabled }: RunComposerProps) {
	const openChat = useWorkspaceChatStore((s) => s.openChat)

	return (
		<div className="rounded-lg border border-border bg-canvas/40">
			<textarea
				rows={2}
				disabled
				placeholder={
					disabled
						? 'Run is terminal — composer is read-only.'
						: 'Reply to the agent via the chat drawer →'
				}
				className="font-data block w-full resize-none rounded-t-lg bg-transparent px-3.5 py-2.5 text-[13px] text-fg placeholder:text-fg-dim focus:outline-none disabled:cursor-not-allowed"
				aria-label="Reply to run"
			/>
			<div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
				<div className="flex items-center gap-1.5">
					<Btn kind="ghost" size="sm" icon="copy" disabled aria-label="Attach">
						Attach
					</Btn>
					<Btn kind="ghost" size="sm" icon="terminal" disabled aria-label="Slash command">
						/ commands
					</Btn>
				</div>
				<div className="flex items-center gap-2 text-[11px] text-fg-dim">
					<span className="inline-flex items-center gap-1">
						<Kbd>⌘</Kbd>
						<Kbd>↵</Kbd>
						<span>to send</span>
					</span>
					<Btn kind="primary" size="sm" icon="send" disabled={disabled} onClick={openChat}>
						Open chat
					</Btn>
				</div>
			</div>
		</div>
	)
}
