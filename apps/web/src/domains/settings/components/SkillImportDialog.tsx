import { useState } from 'react'
import { useMemo } from 'react'

import { DialogPopup } from '@/components/composites/dialog-shell'
import { Button, Icon, AsyncSection } from '@/components/primitives'
import { SkillImportGroup } from '@/domains/settings/components/SkillImportGroup'
import { useImportableSkills, useSkills } from '@/hooks/useSkills'
import { classifyImportCandidate } from '@/lib/skills'
import type { SkillImportCandidate } from '@/types'
import { Dialog } from '@base-ui/react/dialog'
import { toast } from 'sonner'

interface SkillImportDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function SkillImportDialog({ open, onOpenChange }: SkillImportDialogProps) {
	const { candidates, isLoading, error, importSkills, isImporting } = useImportableSkills(open)
	const { skills } = useSkills()
	const [selected, setSelected] = useState<Set<string>>(new Set())

	const groups = useMemo(() => {
		const existing = new Map(skills.map((skill) => [skill.id, skill.origin]))
		const fresh: SkillImportCandidate[] = []
		const updatable: SkillImportCandidate[] = []
		const conflicting: SkillImportCandidate[] = []
		for (const candidate of candidates) {
			const status = classifyImportCandidate(candidate, existing)
			if (status === 'new') fresh.push(candidate)
			else if (status === 'update') updatable.push(candidate)
			else conflicting.push(candidate)
		}
		return { fresh, updatable, conflicting }
	}, [candidates, skills])

	function toggle(id: string) {
		setSelected((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	async function handleImport() {
		const chosen = candidates.filter((candidate) => selected.has(candidate.id))
		if (chosen.length === 0) return
		try {
			await importSkills(chosen)
			toast.success(`Imported ${chosen.length} skill(s)`)
			setSelected(new Set())
			onOpenChange(false)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to import skills')
		}
	}

	function handleOpenChange(next: boolean) {
		if (!next) setSelected(new Set())
		onOpenChange(next)
	}

	return (
		<Dialog.Root open={open} onOpenChange={handleOpenChange}>
			<DialogPopup popupClassName="dialog" align="top">
				<div className="dialog__head">
					<Icon name="download" size={18} className="ic" />
					<Dialog.Title className="dialog__title">Import skills from repo</Dialog.Title>
					<span className="spacer" />
					<Dialog.Close className="iconbtn" aria-label="Close">
						<Icon name="x" size={16} className="ic" />
					</Dialog.Close>
				</div>

				<div className="dialog__body max-h-[60vh] overflow-y-auto">
					<AsyncSection
						isLoading={isLoading}
						error={error}
						isEmpty={candidates.length === 0}
						emptyTitle="No importable skills found"
						emptyDescription="Scans ~/.claude/skills, ~/.agents/skills, ~/.codex/prompts and the target repo by default. Set skills.import_dirs in superkick.yaml to scan more."
					>
						<div className="flex flex-col gap-4">
							<SkillImportGroup
								title="Available"
								candidates={groups.fresh}
								selected={selected}
								onToggle={toggle}
							/>
							<SkillImportGroup
								title="Already imported — re-import to update"
								candidates={groups.updatable}
								selected={selected}
								onToggle={toggle}
								statusLabel="Imported"
							/>
							<SkillImportGroup
								title="Name taken by a builtin or custom skill — rename to import"
								candidates={groups.conflicting}
								selected={selected}
								onToggle={toggle}
								statusLabel="Conflict"
								disabled
							/>
						</div>
					</AsyncSection>
				</div>

				<div className="dialog__foot">
					<span className="hint">{selected.size} selected</span>
					<span className="spacer" />
					<Dialog.Close
						render={
							<Button type="button" variant="ghost" size="sm" disabled={isImporting}>
								Cancel
							</Button>
						}
					/>
					<Button
						type="button"
						size="sm"
						disabled={isImporting || selected.size === 0}
						onClick={handleImport}
					>
						{isImporting ? '…' : 'Import'}
					</Button>
				</div>
			</DialogPopup>
		</Dialog.Root>
	)
}
