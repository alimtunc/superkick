import { useRouter } from '@tanstack/react-router'

export interface UseBackNavigationResult {
	goBack: () => void
	hasHistory: boolean
}

/**
 * Header back button helper. Falls back to a route when the router has no
 * prior history (e.g. the page was deep-linked or opened in a new tab) so
 * the operator is never stranded.
 */
export function useBackNavigation(fallbackTo = '/'): UseBackNavigationResult {
	const router = useRouter()
	const hasHistory = router.history.length > 1
	function goBack() {
		if (router.history.length > 1) {
			router.history.back()
		} else {
			router.navigate({ to: fallbackTo })
		}
	}
	return { goBack, hasHistory }
}
