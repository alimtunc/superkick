import { importSkills, listImportableSkills } from '@/api/skills'
import type { SkillImportCandidate } from '@/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function jsonResponse(body: unknown): Response {
	return { ok: true, status: 200, json: async () => body } as Response
}

const candidate: SkillImportCandidate = {
	id: 'ticket',
	label: 'Ticket',
	description: 'Run a ticket end to end',
	artifact_kind: 'command',
	body: '---\nname: ticket\n---\nbody',
	source_path: 'turkit/plugins/workflow/commands/ticket.md'
}

beforeEach(() => {
	fetchMock.mockReset()
})

afterEach(() => {
	vi.clearAllMocks()
})

describe('listImportableSkills', () => {
	it('GETs the importable endpoint and returns candidates', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse([candidate]))
		const result = await listImportableSkills()
		expect(fetchMock).toHaveBeenCalledWith('/api/skills/importable', {})
		expect(result).toEqual([candidate])
	})
})

describe('importSkills', () => {
	it('POSTs the selected candidates wrapped in a candidates key', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse([]))
		await importSkills([candidate])
		expect(fetchMock).toHaveBeenCalledWith('/api/skills/import', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ candidates: [candidate] })
		})
	})
})
