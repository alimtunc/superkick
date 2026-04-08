import { useRef, useState } from 'react'

import { useConsoleInput } from '@/hooks/useConsoleInput'

export function ConsoleInput({ runId, isTerminal }: { runId: string; isTerminal: boolean }) {
	const [value, setValue] = useState('')
	const { send, isPending, error } = useConsoleInput(runId)
	const inputRef = useRef<HTMLInputElement>(null)

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault()
		const trimmed = value.trim()
		if (trimmed.length === 0) return
		send(trimmed)
		setValue('')
		inputRef.current?.focus()
	}

	if (isTerminal) {
		return (
			<div className="border-t border-edge px-3 py-2">
				<span className="font-data text-[11px] text-dim">Run finished — console read-only</span>
			</div>
		)
	}

	return (
		<form onSubmit={handleSubmit} className="border-t border-edge px-3 py-2">
			<div className="flex items-center gap-2">
				<span className="font-data text-[11px] text-cyan">{'>'}</span>
				<input
					ref={inputRef}
					type="text"
					value={value}
					onChange={(event) => setValue(event.target.value)}
					placeholder="Send operator message..."
					disabled={isPending}
					className="font-data h-7 flex-1 bg-transparent text-[12px] text-fog outline-none placeholder:text-dim"
				/>
				<button
					type="submit"
					disabled={isPending || value.trim().length === 0}
					className="font-data rounded px-2 py-1 text-[10px] tracking-wider text-silver transition-colors hover:text-white disabled:text-dim"
				>
					{isPending ? 'SENDING...' : 'SEND'}
				</button>
			</div>
			{error ? <p className="font-data mt-1 text-[10px] text-oxide">{error}</p> : null}
		</form>
	)
}
