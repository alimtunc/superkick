import { useState } from 'react'

import type { ToolCallEntry } from '@/hooks/useTurnStream'

const PREVIEW_LIMIT = 240

function safeStringify(value: unknown): string {
	if (value === null || value === undefined) return ''
	if (typeof value === 'string') return value
	try {
		return JSON.stringify(value, null, 2)
	} catch {
		return String(value)
	}
}

function truncate(value: string): string {
	if (value.length <= PREVIEW_LIMIT) return value
	return `${value.slice(0, PREVIEW_LIMIT)}…`
}

export function ToolCallBlock({ call }: { call: ToolCallEntry }) {
	const [expanded, setExpanded] = useState(false)
	const inputStr = safeStringify(call.input)
	const outputStr = safeStringify(call.output)
	const hasOutput = call.output !== null

	return (
		<div className="font-data bg-carbon-dim rounded-md border border-edge p-2 text-[11px] text-fog">
			<div className="flex items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<span className="text-cyan uppercase">tool</span>
					<span className="truncate text-fog">{call.tool_name}</span>
					{call.is_error ? (
						<span className="rounded bg-oxide-dim px-1.5 py-0.5 text-[10px] text-oxide">
							error
						</span>
					) : null}
					{!hasOutput ? (
						<span className="rounded bg-cyan-dim px-1.5 py-0.5 text-[10px] text-cyan">
							running…
						</span>
					) : null}
				</div>
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className="text-[10px] text-dim uppercase hover:text-fog"
				>
					{expanded ? 'Collapse' : 'Expand'}
				</button>
			</div>

			<pre className="mt-1.5 break-words whitespace-pre-wrap text-dim">
				input: {expanded ? inputStr : truncate(inputStr)}
			</pre>
			{hasOutput ? (
				<pre className="mt-1 break-words whitespace-pre-wrap text-mineral">
					output: {expanded ? outputStr : truncate(outputStr)}
				</pre>
			) : null}
		</div>
	)
}
