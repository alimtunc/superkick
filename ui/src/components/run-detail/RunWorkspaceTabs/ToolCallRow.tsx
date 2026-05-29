import { useMemo, useState } from 'react'

import { ToolPayloadBlock } from '@/components/run-detail/RunWorkspaceTabs/ToolPayloadBlock'
import { fmtRelativeTime } from '@/lib/domain'
import { stringifyForDisplay } from '@/lib/format/json'
import type { RunToolCall } from '@/types'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface ToolCallRowProps {
	call: RunToolCall
}

export function ToolCallRow({ call }: ToolCallRowProps) {
	const [expanded, setExpanded] = useState(false)
	const inputText = useMemo(() => stringifyForDisplay(call.input), [call.input])
	const outputText = useMemo(() => stringifyForDisplay(call.output), [call.output])
	const pending = call.output === null
	const Caret = expanded ? ChevronDown : ChevronRight

	const dotClass = call.is_error ? 'bg-danger' : pending ? 'bg-warn' : 'bg-info'

	return (
		<li>
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-2 px-5 py-2 text-left hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
				aria-expanded={expanded}
			>
				<Caret size={12} strokeWidth={1.85} className="shrink-0 text-fg-dim" aria-hidden="true" />
				<span
					className={`mt-0.75 h-1.5 w-1.5 shrink-0 self-start rounded-full ${dotClass}`}
					aria-hidden="true"
				/>
				<span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">
					{call.tool_name}
				</span>
				<span className="font-data shrink-0 text-[11px] text-fg-dim">{fmtRelativeTime(call.at)}</span>
				{call.is_error ? (
					<span className="font-data shrink-0 text-[11px] text-danger">error</span>
				) : null}
				{pending ? (
					<span className="font-data shrink-0 text-[11px] text-fg-muted">running…</span>
				) : null}
			</button>
			{expanded ? (
				<div className="space-y-3 px-7 pb-3">
					<ToolPayloadBlock label="input" value={inputText} />
					{call.output !== null ? (
						<ToolPayloadBlock
							label="output"
							value={outputText}
							tone={call.is_error ? 'error' : 'default'}
						/>
					) : (
						<p className="font-data text-[11px] text-fg-muted">No result captured yet.</p>
					)}
				</div>
			) : null}
		</li>
	)
}
