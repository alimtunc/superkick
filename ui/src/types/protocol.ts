// Mirrors `superkick_runtime::protocol::ProtocolEventEnvelope` (SUP-185).
// Persisted as `RunEvent.payload_json` on `kind === 'agent_protocol'` rows.
// Hand-maintained because the backend does not emit a TS schema today.
import { z } from 'zod'

export type ProtocolLogLevel = 'debug' | 'info' | 'warn' | 'error'

// Every field is `.nullish()`, not `.optional()`: the backend `UsageSnapshot`
// has no `skip_serializing_if`, so `Option::None` serializes as explicit JSON
// `null` (the Codex parser always sends `cache_creation_tokens: null` and
// `cost_usd: null`). `.optional()` would reject `null` and silently drop every
// real usage/completion envelope from Activity.
const usageSchema = z.object({
	input_tokens: z.number().nullish(),
	output_tokens: z.number().nullish(),
	cache_read_tokens: z.number().nullish(),
	cache_creation_tokens: z.number().nullish(),
	cost_usd: z.string().nullish()
})

export type ProtocolUsage = z.infer<typeof usageSchema>

const protocolEventSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('session_meta'),
		resume_key: z.string(),
		label: z.string().nullish()
	}),
	z.object({ kind: z.literal('text_delta'), block_id: z.string(), text: z.string() }),
	z.object({ kind: z.literal('text_block'), block_id: z.string(), text: z.string() }),
	z.object({ kind: z.literal('thinking'), block_id: z.string(), text: z.string() }),
	z.object({
		kind: z.literal('log'),
		level: z.enum(['debug', 'info', 'warn', 'error']),
		message: z.string()
	}),
	z.object({
		kind: z.literal('tool_use'),
		call_id: z.string(),
		tool_name: z.string(),
		input: z.unknown()
	}),
	z.object({
		kind: z.literal('tool_result'),
		call_id: z.string(),
		output: z.unknown(),
		is_error: z.boolean()
	}),
	usageSchema.extend({ kind: z.literal('usage') }),
	z.object({
		kind: z.literal('completion'),
		summary: z.string().nullish(),
		usage: usageSchema.nullish()
	}),
	z.object({
		kind: z.literal('failure'),
		code: z.string(),
		message: z.string(),
		usage: usageSchema.nullish()
	}),
	z.object({ kind: z.literal('cancelled'), reason: z.string() })
])

const protocolEnvelopeSchema = z.object({ seq: z.number(), at: z.string() }).and(protocolEventSchema)

export type ProtocolEvent = z.infer<typeof protocolEventSchema>
export type ProtocolEventKind = ProtocolEvent['kind']
export type ProtocolEventEnvelope = z.infer<typeof protocolEnvelopeSchema>

export function parseProtocolEnvelope(payload: unknown): ProtocolEventEnvelope | null {
	const parsed = protocolEnvelopeSchema.safeParse(payload)
	if (parsed.success) return parsed.data
	// A payload this hand-maintained mirror can't read (e.g. a protocol variant
	// newer than the UI) would vanish from Activity/Logs silently — surface it.
	console.warn('[protocol] dropped unparseable agent_protocol envelope', parsed.error)
	return null
}
