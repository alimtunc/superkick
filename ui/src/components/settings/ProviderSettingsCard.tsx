import { useState } from 'react'

import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Button } from '@/components/ui/button'
import { MenuSelect } from '@/components/ui/menu-select'
import { useProviderModels } from '@/hooks/useProviderModels'
import {
	BILLING_LABEL,
	BILLING_OPTIONS,
	EXECUTOR_LABEL,
	PERMISSION_LABEL,
	PERMISSION_OPTIONS,
	REASONING_LABEL,
	SANDBOX_LABEL,
	SANDBOX_OPTIONS,
	executorOptionsFor,
	reasoningOptionsFor
} from '@/lib/launchConfigOptions'
import type { ProviderSettings } from '@/types'

interface ProviderSettingsCardProps {
	settings: ProviderSettings
	onSave: (settings: ProviderSettings) => Promise<unknown>
	isSaving: boolean
}

export function ProviderSettingsCard({ settings, onSave, isSaving }: ProviderSettingsCardProps) {
	const [draft, setDraft] = useState<ProviderSettings>(settings)
	const [synced, setSynced] = useState<ProviderSettings>(settings)
	if (settings !== synced && JSON.stringify(settings) !== JSON.stringify(synced)) {
		setSynced(settings)
		setDraft(settings)
	}
	const { models } = useProviderModels(draft.provider)
	const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
	const title = draft.provider === 'codex' ? 'Codex' : 'Claude'

	function patch<K extends keyof ProviderSettings>(key: K, value: ProviderSettings[K]) {
		setDraft((current) => ({ ...current, [key]: value }))
	}

	return (
		<SettingsSection title={title}>
			<SettingsRow label="Default model" hint="Curated list or type any model id">
				<input
					className="w-56 rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
					list={`models-${draft.provider}`}
					value={draft.default_model ?? ''}
					placeholder="provider default"
					aria-label={`${title} default model`}
					onChange={(event) => patch('default_model', event.target.value || null)}
				/>
				<datalist id={`models-${draft.provider}`}>
					{models.map((model) => (
						<option key={model.id} value={model.id}>
							{model.label}
						</option>
					))}
				</datalist>
			</SettingsRow>
			<SettingsRow label="Reasoning effort" hint="Persisted; CLI wiring is a fast-follow">
				<MenuSelect
					ariaLabel={`${title} reasoning effort`}
					value={draft.default_reasoning}
					options={reasoningOptionsFor(draft.provider)}
					labels={REASONING_LABEL}
					onChange={(value) => patch('default_reasoning', value)}
				/>
			</SettingsRow>
			<SettingsRow label="Default executor">
				<MenuSelect
					ariaLabel={`${title} default executor`}
					value={draft.default_executor}
					options={executorOptionsFor(draft.provider)}
					labels={EXECUTOR_LABEL}
					onChange={(value) => patch('default_executor', value)}
				/>
			</SettingsRow>
			<SettingsRow label="Billing mode">
				<MenuSelect
					ariaLabel={`${title} billing mode`}
					value={draft.billing_mode}
					options={BILLING_OPTIONS}
					labels={BILLING_LABEL}
					onChange={(value) => patch('billing_mode', value)}
				/>
			</SettingsRow>
			<SettingsRow label="Sandbox policy">
				<MenuSelect
					ariaLabel={`${title} sandbox policy`}
					value={draft.sandbox_policy}
					options={SANDBOX_OPTIONS}
					labels={SANDBOX_LABEL}
					onChange={(value) => patch('sandbox_policy', value)}
				/>
			</SettingsRow>
			<SettingsRow label="Permission policy">
				<MenuSelect
					ariaLabel={`${title} permission policy`}
					value={draft.permission_policy}
					options={PERMISSION_OPTIONS}
					labels={PERMISSION_LABEL}
					onChange={(value) => patch('permission_policy', value)}
				/>
			</SettingsRow>
			<SettingsRow label="Enabled" last>
				<div className="flex items-center gap-3">
					<Button size="sm" disabled={!dirty || isSaving} onClick={() => onSave(draft)}>
						{isSaving ? 'Saving…' : 'Save'}
					</Button>
				</div>
			</SettingsRow>
		</SettingsSection>
	)
}
