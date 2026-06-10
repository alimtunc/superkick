import type { RunEvent } from '@/types'
import { z } from 'zod'

const activityKindSchema = z.enum(['diff', 'progress', 'search', 'spec', 'summary', 'test', 'write'])

const activityPayloadSchema = z
	.object({
		activity_kind: activityKindSchema,
		badge: z.string().optional(),
		changed: z.object({ added: z.number().optional(), removed: z.number().optional() }).optional(),
		command: z.string().optional(),
		detail: z.string().optional(),
		file: z.string().optional(),
		snippet: z.array(z.string()).optional(),
		status: z.enum(['fail', 'green', 'running']).optional(),
		tests: z.array(z.object({ name: z.string(), result: z.enum(['fail', 'pass']) })).optional()
	})
	.passthrough()

export type ActivityPayload = z.infer<typeof activityPayloadSchema>

export function activityPayload(event: RunEvent): ActivityPayload | null {
	const parsed = activityPayloadSchema.safeParse(event.payload_json)
	return parsed.success ? parsed.data : null
}

export function hasStructuredActivity(events: readonly RunEvent[]): boolean {
	return events.some((event) => activityPayload(event) !== null)
}
