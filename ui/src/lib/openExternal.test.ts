import { afterEach, describe, expect, it, vi } from 'vitest'

import { openExternal } from './openExternal'

function setTauri(invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>) {
	window.__TAURI__ = { core: { invoke } } as unknown as typeof window.__TAURI__
}

describe('openExternal', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		delete window.__TAURI__
	})

	it('opens a new browser tab when not in the desktop shell', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null)
		await openExternal('https://example.com')
		expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
	})

	it('routes through the Tauri opener plugin in the desktop shell', async () => {
		const invoke = vi.fn().mockResolvedValue(undefined)
		setTauri(invoke)
		const open = vi.spyOn(window, 'open').mockReturnValue(null)
		await openExternal('https://github.com/acme/repo/pull/1')
		expect(invoke).toHaveBeenCalledWith('plugin:opener|open_url', {
			url: 'https://github.com/acme/repo/pull/1',
			with: null
		})
		expect(open).not.toHaveBeenCalled()
	})

	it('falls back to the browser when the opener plugin throws', async () => {
		const invoke = vi.fn().mockRejectedValue(new Error('opener unavailable'))
		setTauri(invoke)
		const open = vi.spyOn(window, 'open').mockReturnValue(null)
		await openExternal('https://example.com')
		expect(open).toHaveBeenCalledTimes(1)
	})

	it('ignores empty urls', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null)
		await openExternal('')
		expect(open).not.toHaveBeenCalled()
	})
})
