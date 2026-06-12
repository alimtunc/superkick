import { Pill } from '@/components/ui/pill'
import { ARTIFACT_KIND_LABEL } from '@/lib/skills'
import type { SkillImportCandidate } from '@/types'

interface SkillImportCandidateRowProps {
	candidate: SkillImportCandidate
	checked: boolean
	onToggle: () => void
	disabled?: boolean
	statusLabel?: string
}

export function SkillImportCandidateRow({
	candidate,
	checked,
	onToggle,
	disabled = false,
	statusLabel
}: SkillImportCandidateRowProps) {
	return (
		<label
			className={`bg-bg flex items-start gap-3 rounded-[8px] border border-border px-3 py-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
		>
			<input
				type="checkbox"
				className="mt-0.5"
				checked={checked}
				disabled={disabled}
				aria-label={`Select ${candidate.label}`}
				onChange={onToggle}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<div className="flex items-center gap-2">
					<span className="truncate text-[13px] text-fg">{candidate.label}</span>
					<Pill tone="neutral">{ARTIFACT_KIND_LABEL[candidate.artifact_kind]}</Pill>
					{statusLabel ? <Pill tone="accent">{statusLabel}</Pill> : null}
				</div>
				{candidate.description ? (
					<span className="text-[12px] text-fg-muted">{candidate.description}</span>
				) : null}
				<span className="truncate font-mono text-[11px] text-fg-dim">{candidate.source_path}</span>
			</div>
		</label>
	)
}
