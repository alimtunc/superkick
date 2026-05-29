import { useMemo, useState } from 'react'

import { ToolPayloadBlock } from '@/components/run-detail/RunWorkspaceTabs/ToolPayloadBlock'
import { fmtRelativeTime } from '@/lib/domain'
import { stringifyForDisplay } from '@/lib/format/json'
import type { RunToolCall } from '@/types'
import { Icon } from '@/ui/Icon'

interface ToolCallRowProps {
	call: RunToolCall
}

export function ToolCallRow({ call }: ToolCallRowProps) {
	const [expanded, setExpanded] = useState(false)
	const inputText = useMemo(() => stringifyForDisplay(call.input), [call.input])
	const outputText = useMemo(() => stringifyForDisplay(call.output), [call.output])
	const pending = call.output === null

	return (
		<div className="toolcall">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="toolcall__head w-full text-left"
				aria-expanded={expanded}
			>
				<Icon name="terminal" size={13} className="ic text-fg-dim" />
				<span className="toolcall__name">{call.tool_name}</span>
				<span className="spacer" />
				{call.is_error ? <span className="font-data text-[11px] text-danger">error</span> : null}
				{pending ? <span className="font-data text-[11px] text-fg-muted">running…</span> : null}
				<span className="toolcall__dur">{fmtRelativeTime(call.at)}</span>
			</button>
			{expanded ? (
				<div className="toolcall__body space-y-3">
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
		</div>
	)
}
