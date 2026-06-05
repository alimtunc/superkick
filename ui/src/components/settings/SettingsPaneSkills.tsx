import { useState } from 'react'

import { SettingsPaneHeader } from '@/components/settings/SettingsPaneHeader'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { AsyncSection } from '@/components/ui/state-async'
import { useSkills } from '@/hooks/useSkills'
import { SKILL_KIND_LABEL } from '@/lib/launchConfigOptions'
import { buildCustomSkill } from '@/lib/skills'
import { Toggle } from '@/ui/Toggle'
import { toast } from 'sonner'

export function SettingsPaneSkills() {
	const { skills, isLoading, error, createSkill, updateSkill, deleteSkill, isMutating } = useSkills()
	const [label, setLabel] = useState('')
	const [prompt, setPrompt] = useState('')

	async function handleCreate() {
		const trimmedLabel = label.trim()
		const trimmedPrompt = prompt.trim()
		if (!trimmedLabel || !trimmedPrompt) return
		try {
			await createSkill(buildCustomSkill(trimmedLabel, trimmedPrompt))
			setLabel('')
			setPrompt('')
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to create skill')
		}
	}

	return (
		<section>
			<SettingsPaneHeader
				title="Skills"
				description="The default skills (Plan, Implement, Review, Pre-PR review) plus your own custom skills. Builtins can be disabled but not deleted."
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
							hint={`${SKILL_KIND_LABEL[skill.kind]} · ${skill.source.kind}`}
							last={index === skills.length - 1}
						>
							<div className="flex items-center gap-2">
								<Pill tone={skill.origin === 'builtin' ? 'neutral' : 'accent'}>
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
								{skill.origin === 'custom' ? (
									<Button
										variant="ghost"
										size="sm"
										disabled={isMutating}
										onClick={() => deleteSkill(skill.id)}
									>
										Delete
									</Button>
								) : null}
							</div>
						</SettingsRow>
					))}
				</SettingsSection>
			</AsyncSection>

			<SettingsSection title="New custom skill">
				<SettingsRow label="Name">
					<input
						className="w-56 rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
						value={label}
						placeholder="My skill"
						aria-label="New skill name"
						onChange={(event) => setLabel(event.target.value)}
					/>
				</SettingsRow>
				<SettingsRow label="Prompt template" last>
					<div className="flex flex-1 flex-col items-end gap-2">
						<textarea
							className="h-20 w-full rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
							value={prompt}
							placeholder="Instructions for the agent…"
							aria-label="New skill prompt template"
							onChange={(event) => setPrompt(event.target.value)}
						/>
						<Button
							size="sm"
							disabled={isMutating || !label.trim() || !prompt.trim()}
							onClick={handleCreate}
						>
							Add skill
						</Button>
					</div>
				</SettingsRow>
			</SettingsSection>
		</section>
	)
}
