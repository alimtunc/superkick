import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// jsdom has no IntersectionObserver; stub one that reports everything visible.
class MockIntersectionObserver implements IntersectionObserver {
	readonly root = null
	readonly rootMargin = ''
	readonly scrollMargin = ''
	readonly thresholds = []
	private readonly callback: IntersectionObserverCallback
	constructor(callback: IntersectionObserverCallback) {
		this.callback = callback
	}
	observe(target: Element) {
		this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this)
	}
	unobserve() {}
	disconnect() {}
	takeRecords(): IntersectionObserverEntry[] {
		return []
	}
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

// jsdom has no ResizeObserver; resizable-panel layout code observes its container.
class MockResizeObserver implements ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

afterEach(() => {
	cleanup()
})
