import type { SkillDefinition } from '@/types'

export function slugify(label: string): string {
	const slug = label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
	return slug || crypto.randomUUID()
}

export function buildCustomSkill(label: string, prompt: string): SkillDefinition {
	return {
		id: slugify(label),
		label,
		kind: 'custom',
		source: { kind: 'prompt', value: prompt },
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
