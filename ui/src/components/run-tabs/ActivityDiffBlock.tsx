import type { ActivityPayload } from '@/components/run-tabs/structuredActivity'
import { diffLineClass } from '@/components/run-tabs/structuredActivityView'
import { Icon } from '@/ui/Icon'

export function ActivityDiffBlock({ payload }: { payload: ActivityPayload }) {
	if (!payload.snippet || payload.snippet.length === 0) return null
	return (
		<div className="toolcall mt-2">
			{payload.file ? (
				<div className="toolcall__head">
					<Icon name="doc" size={13} className="ic text-fg-dim" />
					<span className="toolcall__name">{payload.file}</span>
				</div>
			) : null}
			<pre className="toolcall__body">
				{payload.snippet.map((line) => (
					<div key={line} className={diffLineClass(line)}>
						{line}
					</div>
				))}
			</pre>
		</div>
	)
}
