declare global {
	interface Window {
		__SUPERKICK_VISUAL_PARITY_STATE__?: string
	}
}

export function isVisualParityState(id: string): boolean {
	return typeof window !== 'undefined' && window.__SUPERKICK_VISUAL_PARITY_STATE__ === id
}
