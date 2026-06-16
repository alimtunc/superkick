import { Icon } from '@/components/primitives'
import { MatchHighlight } from '@/domains/command/components/MatchHighlight'
import { ResultRowShell } from '@/domains/command/components/ResultRowShell'
import { formatShortDate } from '@/lib/format'
import type { SearchFileRow } from '@/types'

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
			leading={<Icon name="doc" size={16} className="text-fg-muted" />}
			primary={
				<span className="font-mono">
					<MatchHighlight text={file.path} query={query} />
				</span>
			}
			secondary={sub}
		/>
	)
}
