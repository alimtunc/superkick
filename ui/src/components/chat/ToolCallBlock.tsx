import { useState } from 'react'

import type { ToolCallEntry } from '@/hooks/useTurnStream'

function safeStringify(value: unknown): string {
	if (value === null || value === undefined) return ''
	if (typeof value === 'string') return value
	try {
		return JSON.stringify(value, null, 2)
	} catch {
		return String(value)
	}
}

function inputSummary(input: unknown): string {
	if (input === null || input === undefined) return ''
	if (typeof input === 'string') return input.length > 60 ? `${input.slice(0, 60)}…` : input
	try {
		const compact = JSON.stringify(input)
		return compact.length > 60 ? `${compact.slice(0, 60)}…` : compact
	} catch {
		return ''
	}
}

export function ToolCallBlock({ call }: { call: ToolCallEntry }) {
	const [expanded, setExpanded] = useState(false)
	const hasOutput = call.output !== null
	const summary = inputSummary(call.input)

	return (
		<div className="font-data bg-carbon-dim rounded-md border border-edge text-[11px] text-fog">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-carbon"
				aria-expanded={expanded}
			>
				<span
					aria-hidden="true"
					className={`inline-block text-dim transition-transform ${expanded ? 'rotate-90' : ''}`}
				>
					›
				</span>
				<span className="text-cyan uppercase">tool</span>
				<span className="truncate text-fog">{call.tool_name}</span>
				{call.is_error ? (
					<span className="rounded bg-oxide-dim px-1.5 py-0.5 text-[10px] text-oxide">error</span>
				) : null}
				{!hasOutput ? (
					<span className="rounded bg-cyan-dim px-1.5 py-0.5 text-[10px] text-cyan">running…</span>
				) : null}
				{!expanded && summary ? (
					<span className="ml-auto truncate text-[10px] text-dim">{summary}</span>
				) : null}
			</button>

			{expanded ? (
				<div className="space-y-2 border-t border-edge px-2 py-2">
					<pre className="wrap-break-word whitespace-pre-wrap text-dim">
						input: {safeStringify(call.input)}
					</pre>
					{hasOutput ? (
						<pre className="wrap-break-word whitespace-pre-wrap text-mineral">
							output: {safeStringify(call.output)}
						</pre>
					) : null}
				</div>
			) : null}
		</div>
	)
}
