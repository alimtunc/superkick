import type { InterruptAction } from '@/types'

import { postVoid } from './_shared'

export async function answerInterrupt(
	runId: string,
	interruptId: string,
	action: InterruptAction
): Promise<void> {
	await postVoid(`/runs/${runId}/interrupts/${interruptId}/answer`, 'answer interrupt failed', action)
}
