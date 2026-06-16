import { SkillImportCandidateRow } from '@/domains/settings/components/SkillImportCandidateRow'
import type { SkillImportCandidate } from '@/types'

interface SkillImportGroupProps {
	title: string
	candidates: SkillImportCandidate[]
	selected: ReadonlySet<string>
	onToggle: (id: string) => void
	statusLabel?: string
	disabled?: boolean
}

export function SkillImportGroup({
	title,
	candidates,
	selected,
	onToggle,
	statusLabel,
	disabled = false
}: SkillImportGroupProps) {
	if (candidates.length === 0) return null
	return (
		<div className="flex flex-col gap-2">
			<span className="text-[11px] font-medium tracking-wide text-fg-dim uppercase">{title}</span>
			{candidates.map((candidate) => (
				<SkillImportCandidateRow
					key={candidate.id}
					candidate={candidate}
					checked={selected.has(candidate.id)}
					onToggle={() => onToggle(candidate.id)}
					disabled={disabled}
					statusLabel={statusLabel}
				/>
			))}
		</div>
	)
}
