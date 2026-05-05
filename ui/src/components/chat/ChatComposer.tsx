import { useState } from 'react'

import { Button } from '@/components/ui/button'

interface ChatComposerProps {
	onSubmit: (text: string) => Promise<void> | void
	onCancelActiveTurn: () => Promise<void> | void
	disabled: boolean
	streaming: boolean
	error: string | null
}

export function ChatComposer({
	onSubmit,
	onCancelActiveTurn,
	disabled,
	streaming,
	error
}: ChatComposerProps) {
	const [value, setValue] = useState('')

	const canSend = !disabled && !streaming && value.trim().length > 0

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
		// Enter sends, Shift+Enter inserts a newline. Matches Slack / Linear
		// / Claude.app composer conventions; ⌘/Ctrl+Enter still works because
		// the modifier flag does not block the plain-Enter branch.
		if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault()
			submit()
		}
	}

	return (
		<div className="space-y-2">
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
				className="font-data block w-full resize-y rounded-md border border-edge bg-carbon px-3 py-2 text-[12px] text-fog placeholder-dim focus:border-edge-bright focus:outline-none disabled:opacity-60"
			/>
			{error ? (
				<p className="font-data rounded bg-oxide-dim p-2 text-[11px] text-oxide">{error}</p>
			) : null}
			<div className="flex items-center gap-2">
				<Button
					variant="default"
					size="sm"
					disabled={!canSend}
					onClick={submit}
					className="font-data"
				>
					Send
				</Button>
				{streaming ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => onCancelActiveTurn()}
						className="font-data"
					>
						Cancel turn
					</Button>
				) : null}
			</div>
		</div>
	)
}
