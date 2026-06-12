import { useState } from 'react'

import { SettingsPaneHeader } from '@/components/settings/SettingsPaneHeader'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { SkillEditor } from '@/components/settings/SkillEditor'
import { SkillImportDialog } from '@/components/settings/SkillImportDialog'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { AsyncSection } from '@/components/ui/state-async'
import { useSkills } from '@/hooks/useSkills'
import { SKILL_KIND_LABEL } from '@/lib/launchConfigOptions'
import { blankSkill, isDeletableSkill, skillSourceLabel } from '@/lib/skills'
import type { SkillDefinition } from '@/types'
import { Toggle } from '@/ui/Toggle'
import { toast } from 'sonner'

type EditorState = { open: false } | { open: true; mode: 'create' | 'edit'; seed: SkillDefinition }

export function SettingsPaneSkills() {
	const { skills, isLoading, error, createSkill, updateSkill, deleteSkill, isMutating } = useSkills()
	const [editor, setEditor] = useState<EditorState>({ open: false })
	const [importOpen, setImportOpen] = useState(false)

	function openCreate(sourceKind: 'prompt' | 'installed') {
		setEditor({ open: true, mode: 'create', seed: blankSkill(sourceKind) })
	}

	function openEdit(skill: SkillDefinition) {
		setEditor({ open: true, mode: 'edit', seed: skill })
	}

	async function handleSubmit(skill: SkillDefinition) {
		try {
			if (editor.open && editor.mode === 'edit') {
				await updateSkill({ id: skill.id, skill })
			} else {
				await createSkill(skill)
			}
			setEditor({ open: false })
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to save skill')
		}
	}

	async function handleDelete(id: string) {
		try {
			await deleteSkill(id)
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to delete skill')
		}
	}

	return (
		<section>
			<SettingsPaneHeader
				title="Skills"
				description="The default skills (Plan, Implement, Review, Pre-PR review) plus your own custom and imported skills. Builtins and imported skills can be edited and disabled but not deleted."
			/>
			<AsyncSection
				isLoading={isLoading}
				error={error}
				isEmpty={skills.length === 0}
				emptyTitle="No skills yet"
			>
				<SettingsSection title="Skills">
					{skills.map((skill, index) => (
						<SettingsRow
							key={skill.id}
							label={skill.label}
							hint={`${SKILL_KIND_LABEL[skill.kind]} · ${skillSourceLabel(skill)}`}
							last={index === skills.length - 1}
						>
							<div className="flex items-center gap-2">
								<Pill tone={skill.origin === 'custom' ? 'accent' : 'neutral'}>
									{skill.origin}
								</Pill>
								<Toggle
									checked={skill.enabled}
									ariaLabel={`${skill.label} enabled`}
									disabled={isMutating}
									onChange={(next) =>
										updateSkill({ id: skill.id, skill: { ...skill, enabled: next } })
									}
								/>
								<Button
									variant="ghost"
									size="sm"
									disabled={isMutating}
									onClick={() => openEdit(skill)}
								>
									Edit
								</Button>
								{isDeletableSkill(skill) ? (
									<Button
										variant="ghost"
										size="sm"
										disabled={isMutating}
										onClick={() => handleDelete(skill.id)}
									>
										Delete
									</Button>
								) : null}
							</div>
						</SettingsRow>
					))}
				</SettingsSection>
			</AsyncSection>

			<div className="flex flex-wrap gap-2">
				<Button size="sm" onClick={() => openCreate('prompt')}>
					New prompt skill
				</Button>
				<Button variant="outline" size="sm" onClick={() => openCreate('installed')}>
					New installed skill
				</Button>
				<Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
					Import from repo
				</Button>
			</div>

			{editor.open ? (
				<SkillEditor
					open={editor.open}
					seed={editor.seed}
					mode={editor.mode}
					busy={isMutating}
					onOpenChange={(open) => {
						if (!open) setEditor({ open: false })
					}}
					onSubmit={handleSubmit}
				/>
			) : null}

			<SkillImportDialog open={importOpen} onOpenChange={setImportOpen} />
		</section>
	)
}
