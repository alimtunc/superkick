import { DialogPopup } from '@/components/composites/dialog-shell'
import { MenuSelect } from '@/components/composites/menu-select'
import { Button, Icon, Pill } from '@/components/primitives'
import { AgentAvatarBadge } from '@/domains/agents/components/AgentAvatarBadge'
import { AgentAvatarPicker } from '@/domains/agents/components/AgentAvatarPicker'
import { AgentEditorAdvanced } from '@/domains/agents/components/AgentEditorAdvanced'
import { ModelCombobox } from '@/domains/agents/components/ModelCombobox'
import { SkillPicker } from '@/domains/agents/components/SkillPicker'
import { SkillEditorField } from '@/domains/settings/components/SkillEditorField'
import { useAgentDraft } from '@/hooks/useAgentDraft'
import { useProviderModels } from '@/hooks/useProviderModels'
import { providerLabel } from '@/lib/domain'
import { LAUNCH_PROVIDER_OPTIONS } from '@/lib/launchConfigOptions'
import type { ManagedAgent } from '@/types'
import { Dialog } from '@base-ui/react/dialog'

interface AgentEditorProps {
	open: boolean
	seed: ManagedAgent
	mode: 'create' | 'edit'
	busy: boolean
	onOpenChange: (open: boolean) => void
	onSubmit: (agent: ManagedAgent) => void
}

const DESCRIPTION_MAX = 160

export function AgentEditor({ open, seed, mode, busy, onOpenChange, onSubmit }: AgentEditorProps) {
	const {
		draft,
		slug,
		nameTyped,
		slugEmpty,
		update,
		setProvider,
		setExecutor,
		setSystemPrompt,
		setDescription,
		setMcpServers,
		setToolDeny,
		setToolAllow
	} = useAgentDraft(seed, open, mode)
	const { models } = useProviderModels(draft.provider)

	const canSubmit = !busy && (mode === 'edit' || (nameTyped && !slugEmpty))

	function handleSubmit() {
		if (!canSubmit) return
		onSubmit(mode === 'create' ? { ...draft, name: slug } : draft)
	}

	const title = mode === 'create' ? 'New agent' : `Edit ${seed.name}`

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<DialogPopup popupClassName="dialog" align="top">
				<div className="dialog__head">
					<AgentAvatarBadge avatar={draft.avatar} name={draft.name || 'agent'} size={22} />
					<Dialog.Title className="dialog__title">{title}</Dialog.Title>
					<span className="spacer" />
					<Pill tone={draft.origin === 'custom' ? 'accent' : 'neutral'}>{draft.origin}</Pill>
					<Dialog.Close className="iconbtn" aria-label="Close">
						<Icon name="x" size={16} className="ic" />
					</Dialog.Close>
				</div>

				<div className="dialog__body max-h-[70vh] overflow-y-auto" style={{ gap: 'var(--space-4)' }}>
					<div className="flex flex-col gap-1">
						<span className="text-[12px] text-fg-dim">Avatar</span>
						<AgentAvatarPicker
							value={draft.avatar}
							name={draft.name || 'agent'}
							onChange={(avatar) => update({ avatar })}
						/>
					</div>

					<label className="flex flex-col gap-1">
						<span className="text-[12px] text-fg-dim">Name</span>
						{mode === 'create' ? (
							<input
								className="rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
								value={draft.name}
								placeholder="my-agent"
								aria-label="Agent name"
								onChange={(event) => update({ name: event.target.value })}
							/>
						) : (
							<input
								className="rounded-[6px] border border-border bg-raised px-2 py-1 font-mono text-[12px] text-fg-dim"
								value={seed.name}
								aria-label="Agent name"
								readOnly
							/>
						)}
						{mode === 'create' && slugEmpty ? (
							<span className="text-[12px] text-danger">
								Name must contain a letter or digit.
							</span>
						) : null}
						{mode === 'create' && nameTyped && !slugEmpty && slug !== draft.name ? (
							<span className="text-[12px] text-fg-dim">Saved as: {slug}</span>
						) : null}
					</label>

					<label className="flex flex-col gap-1">
						<span className="flex items-center justify-between text-[12px] text-fg-dim">
							<span>Description</span>
							<span>
								{(draft.description ?? '').length}/{DESCRIPTION_MAX}
							</span>
						</span>
						<input
							className="rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
							value={draft.description ?? ''}
							maxLength={DESCRIPTION_MAX}
							placeholder="What this agent is for…"
							aria-label="Agent description"
							onChange={(event) => setDescription(event.target.value)}
						/>
					</label>

					<div className="grid grid-cols-2 gap-3">
						<SkillEditorField label="Provider">
							<MenuSelect
								ariaLabel="Provider"
								value={draft.provider}
								options={LAUNCH_PROVIDER_OPTIONS}
								labels={providerLabel}
								onChange={setProvider}
							/>
						</SkillEditorField>
						<SkillEditorField label="Model">
							<ModelCombobox
								value={draft.model}
								models={models}
								onChange={(model) => update({ model })}
							/>
						</SkillEditorField>
					</div>

					<label className="flex flex-col gap-1">
						<span className="text-[12px] text-fg-dim">Instructions</span>
						<textarea
							className="h-40 w-full rounded-[6px] border border-border bg-raised px-2 py-1 font-mono text-[12px] text-fg"
							value={draft.system_prompt ?? ''}
							placeholder="System prompt for the agent…"
							aria-label="Agent instructions"
							onChange={(event) => setSystemPrompt(event.target.value)}
						/>
					</label>

					<div className="flex flex-col gap-1">
						<span className="text-[12px] text-fg-dim">Skills</span>
						<SkillPicker value={draft.skills} onChange={(skills) => update({ skills })} />
					</div>

					<AgentEditorAdvanced
						draft={draft}
						onUpdate={update}
						onSetExecutor={setExecutor}
						onSetMcpServers={setMcpServers}
						onSetToolDeny={setToolDeny}
						onSetToolAllow={setToolAllow}
					/>
				</div>

				<div className="dialog__foot">
					<span className="spacer" />
					<Dialog.Close
						render={
							<Button type="button" variant="ghost" size="sm" disabled={busy}>
								Cancel
							</Button>
						}
					/>
					<Button type="button" size="sm" disabled={!canSubmit} onClick={handleSubmit}>
						{busy ? '…' : mode === 'create' ? 'Create' : 'Save'}
					</Button>
				</div>
			</DialogPopup>
		</Dialog.Root>
	)
}
