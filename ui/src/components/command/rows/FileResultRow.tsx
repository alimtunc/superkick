import { MatchHighlight } from '@/components/command/MatchHighlight'
import { ResultRowShell } from '@/components/command/ResultRowShell'
import { formatShortDate } from '@/lib/format'
import type { SearchFileRow } from '@/types'
import { Icon } from '@/ui/Icon'

interface FileResultRowProps {
	file: SearchFileRow
	query: string
	selected: boolean
	onSelect: () => void
	onActivate: () => void
}

export function FileResultRow({ file, query, selected, onSelect, onActivate }: FileResultRowProps) {
	const sub = file.modifiedAt ? `${file.repo} · last edit ${formatShortDate(file.modifiedAt)}` : file.repo
	return (
		<ResultRowShell
			selected={selected}
			onSelect={onSelect}
			onActivate={onActivate}
			leading={<Icon name="doc" size={13} className="text-fg-muted" />}
			primary={
				<span className="font-mono">
					<MatchHighlight text={file.path} query={query} />
				</span>
			}
			secondary={sub}
		/>
	)
}
