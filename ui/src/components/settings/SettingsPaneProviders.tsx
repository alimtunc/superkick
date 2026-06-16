import { ProviderSettingsCard } from '@/components/settings/ProviderSettingsCard'
import { SettingsPaneHeader } from '@/components/settings/SettingsPaneHeader'
import { AsyncSection } from '@/components/ui/state-async'
import { useProviderSettings } from '@/hooks/useProviderSettings'

export function SettingsPaneProviders() {
	const { providers, isLoading, error, updateProvider, isUpdating } = useProviderSettings()

	return (
		<section>
			<SettingsPaneHeader
				title="Providers"
				description="App-managed defaults for each provider. Codex structured and Claude workflow are the subscription-friendly defaults — Claude workflow is subscription-backed for now, subject to Anthropic policy changes. Interactive PTY is the takeover escape hatch."
			/>
			<AsyncSection
				isLoading={isLoading}
				error={error}
				isEmpty={providers.length === 0}
				emptyTitle="No providers configured yet"
			>
				{providers.map((provider) => (
					<ProviderSettingsCard
						key={provider.provider}
						settings={provider}
						isSaving={isUpdating}
						onSave={(settings) => updateProvider({ provider: settings.provider, settings })}
					/>
				))}
			</AsyncSection>
		</section>
	)
}
