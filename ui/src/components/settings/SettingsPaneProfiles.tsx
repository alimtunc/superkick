import { useState } from 'react'

import { ProfileEditorDialog } from '@/components/settings/ProfileEditorDialog'
import { ProfileHideToggle } from '@/components/settings/ProfileHideToggle'
import { SettingsPaneHeader } from '@/components/settings/SettingsPaneHeader'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Pill } from '@/components/ui/pill'
import { AsyncSection } from '@/components/ui/state-async'
import { useLaunchProfiles } from '@/hooks/useLaunchProfiles'
import { EXECUTOR_LABEL, PROFILE_KIND_LABEL } from '@/lib/launchConfigOptions'
import type { LaunchProfile } from '@/types'

type EditorTarget = { mode: 'new' } | { mode: 'edit'; profile: LaunchProfile }

export function SettingsPaneProfiles() {
	const { profiles, isLoading, error, deleteProfile, isMutating } = useLaunchProfiles()
	const [editor, setEditor] = useState<EditorTarget | null>(null)
	const [restoreTarget, setRestoreTarget] = useState<LaunchProfile | null>(null)

	async function handleRestore() {
		if (!restoreTarget) return
		await deleteProfile(restoreTarget.id)
		setRestoreTarget(null)
	}

	return (
		<section>
			<SettingsPaneHeader
				title="Launch profiles"
				description="Ordered step lists you pick (and override) in the Launch Composer. Edit any profile here — including builtins; edits persist across restarts. Restore a builtin to roll back to its shipped recipe. Hide a profile to keep it out of the launcher picker without deleting it."
			/>
			<div className="mb-4 flex justify-end">
				<Button size="sm" onClick={() => setEditor({ mode: 'new' })}>
					New profile
				</Button>
			</div>
			<AsyncSection
				isLoading={isLoading}
				error={error}
				isEmpty={profiles.length === 0}
				emptyTitle="No launch profiles yet"
			>
				{profiles.map((profile) => (
					<SettingsSection key={profile.id} title={profile.name}>
						<SettingsRow
							label="Hidden from launcher"
							hint="Keep this profile out of the Launch Composer picker without deleting it"
						>
							<ProfileHideToggle profileId={profile.id} profileName={profile.name} />
						</SettingsRow>
						<SettingsRow label="Kind" hint={`${profile.steps.length} step(s)`}>
							<div className="flex items-center gap-2">
								<Pill tone="neutral">{PROFILE_KIND_LABEL[profile.kind]}</Pill>
								{profile.is_default ? <Pill tone="accent">default</Pill> : null}
								<Button
									variant="ghost"
									size="sm"
									disabled={isMutating}
									onClick={() => setEditor({ mode: 'edit', profile })}
								>
									Edit
								</Button>
								{profile.is_readonly ? (
									<Button
										variant="ghost"
										size="sm"
										disabled={isMutating}
										onClick={() => setRestoreTarget(profile)}
									>
										Restore default
									</Button>
								) : (
									<Button
										variant="ghost"
										size="sm"
										disabled={isMutating}
										onClick={() => deleteProfile(profile.id)}
									>
										Delete
									</Button>
								)}
							</div>
						</SettingsRow>
						{profile.steps.map((step, index) => (
							<SettingsRow
								key={step.ordering}
								label={`${step.ordering}. ${step.label}`}
								hint={`${step.provider} · ${EXECUTOR_LABEL[step.executor]}`}
								last={index === profile.steps.length - 1}
							>
								<Pill tone={step.enabled ? 'success' : 'neutral'}>
									{step.enabled ? 'enabled' : 'disabled'}
								</Pill>
							</SettingsRow>
						))}
					</SettingsSection>
				))}
			</AsyncSection>

			<ProfileEditorDialog
				open={editor !== null}
				profile={editor?.mode === 'edit' ? editor.profile : null}
				onClose={() => setEditor(null)}
			/>

			<ConfirmDialog
				open={restoreTarget !== null}
				onOpenChange={(next) => {
					if (!next) setRestoreTarget(null)
				}}
				title="Restore default profile?"
				description="This discards your edits to this builtin and re-seeds its shipped recipe on the next restart."
				confirmLabel="Restore"
				destructive
				busy={isMutating}
				onConfirm={handleRestore}
			/>
		</section>
	)
}
