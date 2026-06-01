const SHOW_DONE_KEY = 'superkick.issues.showDone'

export function readShowDonePref(): boolean {
	if (typeof window === 'undefined') return false
	return window.localStorage.getItem(SHOW_DONE_KEY) === 'true'
}

export function writeShowDonePref(value: boolean) {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(SHOW_DONE_KEY, String(value))
	} catch {
		return
	}
}
