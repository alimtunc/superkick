import type { SkillArtifactKind, SkillDefinition, SkillImportCandidate, SkillSource } from '@/types'

// `new`: id is free. `update`: id already names an imported skill — re-import
// refreshes its body. `conflict`: id is taken by a builtin/custom skill, so
// import would be rejected server-side.
export type ImportCandidateStatus = 'new' | 'update' | 'conflict'

export function classifyImportCandidate(
	candidate: SkillImportCandidate,
	existing: ReadonlyMap<string, SkillDefinition['origin']>
): ImportCandidateStatus {
	const origin = existing.get(candidate.id)
	if (!origin) return 'new'
	return origin === 'imported' ? 'update' : 'conflict'
}

// Mirrors `MAX_PROMPT_TEMPLATE_CHARS` in superkick-core: inline Prompt templates
// are injected verbatim into the agent prompt, so they are length-capped.
// File-backed `body` is never inlined and is not subject to this cap.
export const MAX_PROMPT_TEMPLATE_CHARS = 16_000

export function slugify(label: string): string {
	const slug = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
	return slug || crypto.randomUUID()
}

export function promptTemplateError(template: string): string | null {
	if (template.trim().length === 0) return 'Prompt template is required'
	if (template.length > MAX_PROMPT_TEMPLATE_CHARS) {
		return `Prompt template must be ${MAX_PROMPT_TEMPLATE_CHARS.toLocaleString()} characters or fewer`
	}
	return null
}

export function fileBackedBodyError(body: string | null | undefined): string | null {
	if ((body ?? '').trim().length === 0) return 'Instructions are required'
	return null
}

export function isPromptSource(source: SkillSource): boolean {
	return source.kind === 'prompt'
}

// `installed` skills (builtins, imported, managed) carry their instructions in
// the file-backed `body`, which the operator edits directly. `prompt` skills
// keep their instructions inline in `source.value`.
export function isFileBackedSource(source: SkillSource): boolean {
	return source.kind === 'installed'
}

export function skillSourceLabel(skill: SkillDefinition): string {
	return skill.source.kind === 'installed' ? `installed · ${skill.source.value}` : 'prompt'
}

function newPromptSkill(): SkillDefinition {
	return {
		id: '',
		label: '',
		kind: 'custom',
		source: { kind: 'prompt', value: '' },
		body: null,
		artifact_kind: 'skill',
		default_provider: 'codex',
		default_model: null,
		default_reasoning: 'medium',
		default_executor: 'codex_structured',
		default_session_policy: 'fresh',
		default_output_expectation: 'patch',
		enabled: true,
		origin: 'custom'
	}
}

function newInstalledSkill(): SkillDefinition {
	return {
		...newPromptSkill(),
		source: { kind: 'installed', value: '' }
	}
}

export function blankSkill(sourceKind: SkillSource['kind']): SkillDefinition {
	return sourceKind === 'installed' ? newInstalledSkill() : newPromptSkill()
}

export function buildCustomSkill(label: string, prompt: string): SkillDefinition {
	const base = newPromptSkill()
	return { ...base, id: slugify(label), label, source: { kind: 'prompt', value: prompt } }
}

export const ARTIFACT_KIND_LABEL: Record<SkillArtifactKind, string> = {
	skill: 'Skill',
	command: 'Command'
}

export const ARTIFACT_KIND_OPTIONS: SkillArtifactKind[] = ['skill', 'command']
