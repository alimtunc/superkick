import { useRouter } from '@tanstack/react-router'

export function useBackNavigation(fallbackTo = '/') {
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
