import { describe, expect, it } from 'vitest'

import { langFromPath } from './lang'

describe('langFromPath', () => {
	it('maps common extensions to highlight languages', () => {
		expect(langFromPath('src/main.rs')).toBe('rust')
		expect(langFromPath('ui/src/App.tsx')).toBe('tsx')
		expect(langFromPath('lib/util.ts')).toBe('typescript')
		expect(langFromPath('config.json')).toBe('json')
		expect(langFromPath('styles/app.css')).toBe('css')
		expect(langFromPath('scripts/build.py')).toBe('python')
		expect(langFromPath('ci/pipeline.yaml')).toBe('yaml')
		expect(langFromPath('Cargo.toml')).toBe('ini')
		expect(langFromPath('bin/setup.sh')).toBe('bash')
	})

	it('resolves extensionless well-known filenames', () => {
		expect(langFromPath('Dockerfile')).toBe('dockerfile')
		expect(langFromPath('services/api/Dockerfile')).toBe('dockerfile')
	})

	it('maps the Cargo.lock filename to ini', () => {
		expect(langFromPath('Cargo.lock')).toBe('ini')
		expect(langFromPath('crates/app/Cargo.lock')).toBe('ini')
	})

	it('falls back to plaintext for unknown extensions', () => {
		expect(langFromPath('notes.xyz')).toBe('plaintext')
		expect(langFromPath('LICENSE')).toBe('plaintext')
	})
})
