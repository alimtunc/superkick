/** 422 carries Linear's `userPresentableMessage`; 503 means missing config; 429 is defensive. */
export function linearErrorMessage(
	status: number,
	serverMessage: string | undefined,
	fallback: string
): string {
	if (status === 422) {
		return serverMessage ?? fallback
	}
	if (status === 503) {
		return 'Linear isn’t configured. Add LINEAR_API_KEY to enable writes.'
	}
	if (status === 429) {
		return 'Linear is rate-limiting Superkick. Try again in a moment.'
	}
	return serverMessage ?? `${fallback}: ${status}`
}
