import type { SkillDefinition, SkillImportCandidate } from '@/types'

import { deleteVoid, getJson, patchJson, postJson } from './_shared'

export async function fetchSkills(): Promise<SkillDefinition[]> {
	return getJson('/skills', 'fetch skills failed')
}

export async function listImportableSkills(): Promise<SkillImportCandidate[]> {
	return getJson('/skills/importable', 'list importable skills failed')
}

export async function importSkills(candidates: SkillImportCandidate[]): Promise<SkillDefinition[]> {
	return postJson('/skills/import', 'import skills failed', { candidates })
}

export async function createSkill(skill: SkillDefinition): Promise<SkillDefinition> {
	return postJson('/skills', 'create skill failed', skill)
}

export async function updateSkill(id: string, skill: SkillDefinition): Promise<SkillDefinition> {
	return patchJson(`/skills/${id}`, 'update skill failed', skill)
}

export async function deleteSkill(id: string): Promise<void> {
	return deleteVoid(`/skills/${id}`, 'delete skill failed')
}
