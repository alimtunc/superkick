import { SettingsPaneHeader } from '@/components/settings/SettingsPaneHeader'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import { AsyncSection } from '@/components/ui/state-async'
import { useLaunchProfiles } from '@/hooks/useLaunchProfiles'
import { EXECUTOR_LABEL, PROFILE_KIND_LABEL } from '@/lib/launchConfigOptions'

export function SettingsPaneProfiles() {
	const { profiles, isLoading, error, deleteProfile, isMutating } = useLaunchProfiles()

	return (
		<section>
			<SettingsPaneHeader
				title="Launch profiles"
				description="Ordered step lists you pick (and override) in the Launch Composer. Standard reproduces the Plan → Implement → Review recipe. Edit a profile by launching from it in the Composer."
			/>
			<AsyncSection
				isLoading={isLoading}
				error={error}
				isEmpty={profiles.length === 0}
				emptyTitle="No launch profiles yet"
			>
				{profiles.map((profile) => (
					<SettingsSection key={profile.id} title={profile.name}>
						<SettingsRow label="Kind" hint={`${profile.steps.length} step(s)`}>
							<div className="flex items-center gap-2">
								<Pill tone="neutral">{PROFILE_KIND_LABEL[profile.kind]}</Pill>
								{profile.is_default ? <Pill tone="accent">default</Pill> : null}
								{profile.is_readonly ? null : (
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
		</section>
	)
}
