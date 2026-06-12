import { useEffect, useState } from 'react'

import { ConfigSelect } from '@/components/settings/ConfigSelect'
import { SkillEditorField } from '@/components/settings/SkillEditorField'
import { Button } from '@/components/ui/button'
import { DialogPopup } from '@/components/ui/dialog-shell'
import { Pill } from '@/components/ui/pill'
import { providerLabel } from '@/lib/domain'
import {
	EXECUTOR_LABEL,
	EXECUTOR_OPTIONS,
	LAUNCH_PROVIDER_OPTIONS,
	OUTPUT_EXPECTATION_LABEL,
	OUTPUT_EXPECTATION_OPTIONS,
	REASONING_LABEL,
	SESSION_POLICY_LABEL,
	SESSION_POLICY_OPTIONS,
	SKILL_KIND_LABEL,
	SKILL_KIND_OPTIONS,
	clampReasoningForProvider,
	reasoningOptionsFor
} from '@/lib/launchConfigOptions'
import {
	ARTIFACT_KIND_LABEL,
	ARTIFACT_KIND_OPTIONS,
	MAX_PROMPT_TEMPLATE_CHARS,
	fileBackedBodyError,
	isFileBackedSource,
	isPromptSource,
	promptTemplateError,
	slugify
} from '@/lib/skills'
import type { AgentProvider, SkillDefinition } from '@/types'
import { Icon } from '@/ui/Icon'
import { Dialog } from '@base-ui/react/dialog'

interface SkillEditorProps {
	open: boolean
	seed: SkillDefinition
	mode: 'create' | 'edit'
	busy: boolean
	onOpenChange: (open: boolean) => void
	onSubmit: (skill: SkillDefinition) => void
}

export function SkillEditor({ open, seed, mode, busy, onOpenChange, onSubmit }: SkillEditorProps) {
	const [draft, setDraft] = useState<SkillDefinition>(seed)

	useEffect(() => {
		if (open) setDraft(seed)
	}, [open, seed])

	const isPrompt = isPromptSource(draft.source)
	const isFileBacked = isFileBackedSource(draft.source)
	const template = isPrompt ? draft.source.value : ''
	const templateError = isPrompt ? promptTemplateError(template) : null
	const bodyError = isFileBacked ? fileBackedBodyError(draft.body) : null
	const labelMissing = draft.label.trim().length === 0
	// Installed skills are resolved by filesystem slug, which the runtime requires
	// to equal `id`. Edit mode keeps the persisted id; create mode derives it.
	const installedSlug = mode === 'create' ? slugify(draft.label) : draft.id
	const canSubmit = !busy && !labelMissing && templateError === null && bodyError === null

	function update(patch: Partial<SkillDefinition>) {
		setDraft((prev) => ({ ...prev, ...patch }))
	}

	function setProvider(provider: AgentProvider) {
		setDraft((prev) => ({
			...prev,
			default_provider: provider,
			default_reasoning: clampReasoningForProvider(prev.default_reasoning, provider)
		}))
	}

	function handleSubmit() {
		if (!canSubmit) return
		const id = mode === 'create' ? slugify(draft.label) : draft.id
		const source = isFileBacked ? { kind: 'installed' as const, value: id } : draft.source
		onSubmit({ ...draft, id, source })
	}

	const title = mode === 'create' ? 'New skill' : `Edit ${seed.label}`

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<DialogPopup popupClassName="dialog" align="top">
				<div className="dialog__head">
					<Icon name="spark" size={18} className="ic" />
					<Dialog.Title className="dialog__title">{title}</Dialog.Title>
					<span className="spacer" />
					<Pill tone={draft.origin === 'custom' ? 'accent' : 'neutral'}>{draft.origin}</Pill>
					<Dialog.Close className="iconbtn" aria-label="Close">
						<Icon name="x" size={16} className="ic" />
					</Dialog.Close>
				</div>

				<div className="dialog__body max-h-[70vh] overflow-y-auto" style={{ gap: 'var(--space-4)' }}>
					<label className="flex flex-col gap-1">
						<span className="text-[12px] text-fg-dim">Name</span>
						<input
							className="rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
							value={draft.label}
							placeholder="My skill"
							aria-label="Skill name"
							onChange={(event) => update({ label: event.target.value })}
						/>
					</label>

					<div className="flex flex-wrap items-center gap-2">
						<ConfigSelect
							ariaLabel="Skill kind"
							value={draft.kind}
							options={SKILL_KIND_OPTIONS}
							labels={SKILL_KIND_LABEL}
							onChange={(value) => update({ kind: value })}
						/>
						{isFileBacked ? (
							<ConfigSelect
								ariaLabel="Skill artifact kind"
								value={draft.artifact_kind}
								options={ARTIFACT_KIND_OPTIONS}
								labels={ARTIFACT_KIND_LABEL}
								onChange={(value) => update({ artifact_kind: value })}
							/>
						) : null}
					</div>

					{isPrompt ? (
						<label className="flex flex-col gap-1">
							<span className="flex items-center justify-between text-[12px] text-fg-dim">
								<span>Instructions</span>
								<span className={templateError ? 'text-danger' : undefined}>
									{template.length.toLocaleString()} /{' '}
									{MAX_PROMPT_TEMPLATE_CHARS.toLocaleString()}
								</span>
							</span>
							<textarea
								className="h-48 w-full rounded-[6px] border border-border bg-raised px-2 py-1 font-mono text-[12px] text-fg"
								value={template}
								placeholder="Instructions for the agent…"
								aria-label="Skill instructions"
								onChange={(event) =>
									update({ source: { kind: 'prompt', value: event.target.value } })
								}
							/>
							{templateError ? (
								<span className="text-[12px] text-danger">{templateError}</span>
							) : null}
						</label>
					) : (
						<div className="flex flex-col gap-2">
							<label className="flex flex-col gap-1">
								<span className="text-[12px] text-fg-dim">Installed skill slug</span>
								<input
									className="rounded-[6px] border border-border bg-raised px-2 py-1 font-mono text-[12px] text-fg-dim"
									value={installedSlug}
									placeholder="derived-from-name"
									aria-label="Installed skill slug"
									readOnly
								/>
								<span className="text-[12px] text-fg-dim">Derived from the skill name.</span>
							</label>
							<label className="flex flex-col gap-1">
								<span className="text-[12px] text-fg-dim">Instructions</span>
								<textarea
									className="h-48 w-full rounded-[6px] border border-border bg-raised px-2 py-1 font-mono text-[12px] text-fg"
									value={draft.body ?? ''}
									placeholder="Instructions for the agent…"
									aria-label="Skill instructions"
									onChange={(event) => update({ body: event.target.value })}
								/>
								{bodyError ? (
									<span className="text-[12px] text-danger">{bodyError}</span>
								) : (
									<span className="text-[12px] text-fg-dim">
										Edits to these instructions persist and change how the skill runs.
									</span>
								)}
							</label>
						</div>
					)}

					<div className="grid grid-cols-2 gap-3">
						<SkillEditorField label="Provider">
							<ConfigSelect
								ariaLabel="Default provider"
								value={draft.default_provider}
								options={LAUNCH_PROVIDER_OPTIONS}
								labels={providerLabel}
								onChange={setProvider}
							/>
						</SkillEditorField>
						<SkillEditorField label="Model">
							<input
								className="w-full rounded-[6px] border border-border bg-raised px-2 py-1 text-[13px] text-fg"
								value={draft.default_model ?? ''}
								placeholder="provider default"
								aria-label="Default model"
								onChange={(event) =>
									update({ default_model: event.target.value.trim() || null })
								}
							/>
						</SkillEditorField>
						<SkillEditorField label="Reasoning">
							<ConfigSelect
								ariaLabel="Default reasoning"
								value={draft.default_reasoning}
								options={reasoningOptionsFor(draft.default_provider)}
								labels={REASONING_LABEL}
								onChange={(value) => update({ default_reasoning: value })}
							/>
						</SkillEditorField>
						<SkillEditorField label="Executor">
							<ConfigSelect
								ariaLabel="Default executor"
								value={draft.default_executor}
								options={EXECUTOR_OPTIONS}
								labels={EXECUTOR_LABEL}
								onChange={(value) => update({ default_executor: value })}
							/>
						</SkillEditorField>
						<SkillEditorField label="Session policy">
							<ConfigSelect
								ariaLabel="Default session policy"
								value={draft.default_session_policy}
								options={SESSION_POLICY_OPTIONS}
								labels={SESSION_POLICY_LABEL}
								onChange={(value) => update({ default_session_policy: value })}
							/>
						</SkillEditorField>
						<SkillEditorField label="Output">
							<ConfigSelect
								ariaLabel="Default output expectation"
								value={draft.default_output_expectation}
								options={OUTPUT_EXPECTATION_OPTIONS}
								labels={OUTPUT_EXPECTATION_LABEL}
								onChange={(value) => update({ default_output_expectation: value })}
							/>
						</SkillEditorField>
					</div>
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
