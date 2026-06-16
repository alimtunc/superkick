import {
	MAX_PROMPT_TEMPLATE_CHARS,
	blankSkill,
	buildCustomSkill,
	fileBackedBodyError,
	isFileBackedSource,
	isPromptSource,
	promptTemplateError,
	skillSourceLabel,
	slugify
} from '@/lib/skills'
import type { SkillDefinition } from '@/types'
import { describe, expect, it } from 'vitest'

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
	return { ...buildCustomSkill('Seed', 'body'), ...overrides }
}

describe('promptTemplateError', () => {
	it('rejects an empty template', () => {
		expect(promptTemplateError('')).toBe('Prompt template is required')
		expect(promptTemplateError('   ')).toBe('Prompt template is required')
	})

	it('accepts a template at the cap', () => {
		expect(promptTemplateError('a'.repeat(MAX_PROMPT_TEMPLATE_CHARS))).toBeNull()
	})

	it('rejects a template over the cap', () => {
		const err = promptTemplateError('a'.repeat(MAX_PROMPT_TEMPLATE_CHARS + 1))
		expect(err).toContain('characters or fewer')
	})
})

describe('fileBackedBodyError', () => {
	it('rejects an empty or whitespace body', () => {
		expect(fileBackedBodyError('')).toBe('Instructions are required')
		expect(fileBackedBodyError('   ')).toBe('Instructions are required')
		expect(fileBackedBodyError(null)).toBe('Instructions are required')
		expect(fileBackedBodyError(undefined)).toBe('Instructions are required')
	})

	it('accepts a non-empty body', () => {
		expect(fileBackedBodyError('do the thing')).toBeNull()
	})
})

describe('slugify', () => {
	it('lowercases and underscores', () => {
		expect(slugify('My Cool Skill!')).toBe('my_cool_skill')
	})
})

describe('isPromptSource', () => {
	it('discriminates prompt vs installed', () => {
		expect(isPromptSource({ kind: 'prompt', value: 'x' })).toBe(true)
		expect(isPromptSource({ kind: 'installed', value: 'x' })).toBe(false)
	})
})

describe('isFileBackedSource', () => {
	it('treats installed skills as file-backed (editable body)', () => {
		expect(isFileBackedSource({ kind: 'installed', value: 'x' })).toBe(true)
		expect(isFileBackedSource({ kind: 'prompt', value: 'x' })).toBe(false)
	})
})

describe('blankSkill', () => {
	it('seeds a prompt skill', () => {
		const skill = blankSkill('prompt')
		expect(skill.source.kind).toBe('prompt')
		expect(skill.origin).toBe('custom')
		expect(skill.artifact_kind).toBe('skill')
	})

	it('seeds an installed skill', () => {
		expect(blankSkill('installed').source.kind).toBe('installed')
	})
})

describe('skillSourceLabel', () => {
	it('labels installed skills with their slug', () => {
		expect(skillSourceLabel(makeSkill({ source: { kind: 'installed', value: 'ticket' } }))).toBe(
			'installed · ticket'
		)
	})

	it('labels prompt skills', () => {
		expect(skillSourceLabel(makeSkill({ source: { kind: 'prompt', value: 'x' } }))).toBe('prompt')
	})
})
