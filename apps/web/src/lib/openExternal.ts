import { isDesktopShell, openDesktopUrl } from '@/lib/desktop'

// Single entry point for opening an external URL. In the Tauri desktop shell a
// plain anchor/window.open is silently dropped, so we go through the opener
// plugin; in a plain browser we fall back to a new tab.
export async function openExternal(url: string): Promise<void> {
	if (!url) {
		return
	}
	if (isDesktopShell()) {
		try {
			await openDesktopUrl(url)
			return
		} catch {
			// Desktop opener unavailable — fall through to the browser path.
		}
	}
	window.open(url, '_blank', 'noopener,noreferrer')
}
