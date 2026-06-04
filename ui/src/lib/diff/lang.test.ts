import { describe, expect, it } from 'vitest'

import { langFromPath } from './lang'

describe('langFromPath', () => {
	it('maps common extensions to highlight languages', () => {
		expect(langFromPath('src/main.rs')).toBe('rust')
		expect(langFromPath('ui/src/App.tsx')).toBe('tsx')
		expect(langFromPath('lib/util.ts')).toBe('typescript')
		expect(langFromPath('config.json')).toBe('json')
		expect(langFromPath('styles/app.css')).toBe('css')
	})

	it('resolves extensionless well-known filenames', () => {
		expect(langFromPath('Dockerfile')).toBe('dockerfile')
		expect(langFromPath('services/api/Dockerfile')).toBe('dockerfile')
	})

	it('falls back to plaintext for unknown extensions', () => {
		expect(langFromPath('notes.xyz')).toBe('plaintext')
		expect(langFromPath('LICENSE')).toBe('plaintext')
	})
})
