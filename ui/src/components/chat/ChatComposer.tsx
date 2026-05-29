import { useState } from 'react'

import { ModelPicker } from '@/components/chat/ModelPicker'
import { ModePicker } from '@/components/chat/ModePicker'
import { ProviderPicker } from '@/components/chat/ProviderPicker'
import { Button } from '@/components/ui/button'
import type { AgentProvider, ChatPermissionMode } from '@/types'
import { ArrowUp, Square } from 'lucide-react'

interface ChatComposerProps {
	onSubmit: (text: string) => Promise<void> | void
	onCancelActiveTurn: () => Promise<void> | void
	disabled: boolean
	streaming: boolean
	error: string | null
	mode: ChatPermissionMode
	model: string | null
	provider: AgentProvider | null
	onModeChange: (next: ChatPermissionMode) => void
	onModelChange: (next: string | null) => void
	/** When supplied, the toolbar shows an interactive provider picker as
	 * the first pill. Omit it once the conversation is created — the
	 * provider is fixed by the conversation row at that point. */
	onProviderChange?: (next: AgentProvider) => void
}

export function ChatComposer({
	onSubmit,
	onCancelActiveTurn,
	disabled,
	streaming,
	error,
	mode,
	model,
	provider,
	onModeChange,
	onModelChange,
	onProviderChange
}: ChatComposerProps) {
	const [value, setValue] = useState('')

	const canSend =
		!disabled && !streaming && value.trim().length > 0 && (onProviderChange ? provider !== null : true)

	const submit = async () => {
		if (!canSend) return
		const text = value.trim()
		setValue('')
		try {
			await onSubmit(text)
		} catch {
			// error surfaces via parent's `error` prop
			setValue(text)
		}
	}

	const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Enter sends; Shift+Enter is newline (matches Slack/Linear/Claude.app).
		if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault()
			submit()
		}
	}

	return (
		<div className="space-y-2">
			<div className="rounded-md border border-border bg-surface focus-within:border-border-strong">
				<textarea
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder={
						streaming
							? 'Compose your next message… Send unlocks once the current turn finishes.'
							: 'Ask the agent…   Enter to send · Shift+Enter for newline'
					}
					disabled={disabled}
					rows={3}
					aria-label="Message"
					className="font-data block w-full resize-y rounded-t-md border-0 bg-transparent px-3 py-2 text-[12px] text-fg placeholder-fg-dim focus:outline-none disabled:opacity-60"
				/>
				<div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
					<div className="flex items-center gap-1.5">
						{onProviderChange ? (
							<ProviderPicker
								value={provider}
								onChange={onProviderChange}
								disabled={disabled || streaming}
							/>
						) : null}
						<ModelPicker
							provider={provider}
							value={model}
							onChange={onModelChange}
							disabled={disabled || streaming || (onProviderChange ? provider === null : false)}
						/>
						<ModePicker value={mode} onChange={onModeChange} disabled={disabled || streaming} />
					</div>
					<div className="flex items-center gap-1.5">
						{streaming ? (
							<Button
								variant="outline"
								size="icon-sm"
								onClick={() => onCancelActiveTurn()}
								className="font-data"
								title="Cancel turn"
								aria-label="Cancel turn"
							>
								<Square size={12} strokeWidth={2} aria-hidden="true" />
							</Button>
						) : null}
						<Button
							variant="default"
							size="icon-sm"
							disabled={!canSend}
							onClick={submit}
							className="font-data"
							title="Send"
							aria-label="Send"
						>
							<ArrowUp size={14} strokeWidth={2} aria-hidden="true" />
						</Button>
					</div>
				</div>
			</div>
			{error ? (
				<p className="font-data rounded bg-danger-soft p-2 text-[11px] text-danger">{error}</p>
			) : null}
		</div>
	)
}
