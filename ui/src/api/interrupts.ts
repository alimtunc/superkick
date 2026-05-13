import type { InterruptAction } from '@/types'

import { BASE, throwGenericApiError } from './_shared'

export async function answerInterrupt(
	runId: string,
	interruptId: string,
	action: InterruptAction
): Promise<void> {
	const res = await fetch(`${BASE}/runs/${runId}/interrupts/${interruptId}/answer`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(action)
	})
	if (!res.ok) await throwGenericApiError(res, 'answer interrupt failed')
}
