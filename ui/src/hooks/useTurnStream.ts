import { useEffect, useReducer, useRef } from 'react'

import { subscribeToTurnEvents } from '@/api'
import type { ToolCallEntry, TurnEvent, TurnEventEnvelope } from '@/types'

interface RenderedTurn {
	text: string
	toolCalls: ToolCallEntry[]
	thinking: string
	terminal: boolean
	lastSeq: number
}

interface ReducerState {
	rendered: RenderedTurn
	textBlocks: Map<string, string>
	textOrder: string[]
	toolCalls: Map<string, ToolCallEntry>
	toolOrder: string[]
	thinkingBlocks: Map<string, string>
	thinkingOrder: string[]
}

function initialState(): ReducerState {
	return {
		rendered: { text: '', toolCalls: [], thinking: '', terminal: false, lastSeq: -1 },
		textBlocks: new Map(),
		textOrder: [],
		toolCalls: new Map(),
		toolOrder: [],
		thinkingBlocks: new Map(),
		thinkingOrder: []
	}
}

type Action =
	| { type: 'reset' }
	| { type: 'apply'; envelope: TurnEventEnvelope }
	| { type: 'bulk_apply'; events: TurnEventEnvelope[] }

function applyEnvelope(state: ReducerState, envelope: TurnEventEnvelope): ReducerState {
	if (envelope.seq <= state.rendered.lastSeq) return state

	const next: ReducerState = {
		...state,
		textBlocks: new Map(state.textBlocks),
		textOrder: [...state.textOrder],
		toolCalls: new Map(state.toolCalls),
		toolOrder: [...state.toolOrder],
		thinkingBlocks: new Map(state.thinkingBlocks),
		thinkingOrder: [...state.thinkingOrder]
	}

	let terminal = state.rendered.terminal

	switch (envelope.kind) {
		case 'text_delta':
		case 'text_block': {
			const prev = next.textBlocks.get(envelope.block_id) ?? ''
			const updated = envelope.kind === 'text_delta' ? prev + envelope.text : envelope.text
			if (!next.textBlocks.has(envelope.block_id)) next.textOrder.push(envelope.block_id)
			next.textBlocks.set(envelope.block_id, updated)
			break
		}
		case 'thinking': {
			const prev = next.thinkingBlocks.get(envelope.block_id) ?? ''
			if (!next.thinkingBlocks.has(envelope.block_id)) next.thinkingOrder.push(envelope.block_id)
			next.thinkingBlocks.set(envelope.block_id, prev + envelope.text)
			break
		}
		case 'tool_use': {
			next.toolCalls.set(envelope.call_id, {
				call_id: envelope.call_id,
				tool_name: envelope.tool_name,
				input: envelope.input,
				output: null,
				is_error: false
			})
			if (!next.toolOrder.includes(envelope.call_id)) next.toolOrder.push(envelope.call_id)
			break
		}
		case 'tool_result': {
			const existing = next.toolCalls.get(envelope.call_id)
			if (existing) {
				next.toolCalls.set(envelope.call_id, {
					...existing,
					output: envelope.output,
					is_error: envelope.is_error
				})
			} else {
				next.toolCalls.set(envelope.call_id, {
					call_id: envelope.call_id,
					tool_name: '<unknown>',
					input: null,
					output: envelope.output,
					is_error: envelope.is_error
				})
				if (!next.toolOrder.includes(envelope.call_id)) next.toolOrder.push(envelope.call_id)
			}
			break
		}
		case 'completion':
		case 'failure':
		case 'cancelled': {
			terminal = true
			break
		}
		// session_meta, log, usage: tracked at a higher level (transcript header / usage badge)
		default:
			break
	}

	const text = next.textOrder.map((id) => next.textBlocks.get(id) ?? '').join('\n\n')
	// Skip empty thinking blocks: a thinking envelope with empty text registers
	// the block in `thinkingOrder` (see reducer above) before any text arrives,
	// which would otherwise render a stray empty disclosure.
	const thinking = next.thinkingOrder
		.map((id) => next.thinkingBlocks.get(id) ?? '')
		.filter((block) => block.trim().length > 0)
		.join('\n\n')
	const toolCalls = next.toolOrder
		.map((id) => next.toolCalls.get(id))
		.filter((c): c is ToolCallEntry => c !== undefined)

	next.rendered = { text, toolCalls, thinking, terminal, lastSeq: envelope.seq }
	return next
}

function reducer(state: ReducerState, action: Action): ReducerState {
	switch (action.type) {
		case 'reset':
			return initialState()
		case 'apply':
			return applyEnvelope(state, action.envelope)
		case 'bulk_apply':
			return action.events.reduce(applyEnvelope, state)
	}
}

interface UseTurnStreamArgs {
	turnId: string | null
	historicalEvents?: TurnEvent[]
	live?: boolean
	onTerminal?: () => void
	onLiveEvent?: () => void
}

export function useTurnStream(args: UseTurnStreamArgs) {
	const { turnId, historicalEvents = [], live = true, onTerminal, onLiveEvent } = args
	const [state, dispatch] = useReducer(reducer, undefined, initialState)

	// Latest callbacks in refs so we can fire them from effects without
	// re-subscribing on every parent render.
	const onTerminalRef = useRef(onTerminal)
	useEffect(() => {
		onTerminalRef.current = onTerminal
	}, [onTerminal])
	const onLiveEventRef = useRef(onLiveEvent)
	useEffect(() => {
		onLiveEventRef.current = onLiveEvent
	}, [onLiveEvent])

	// One-shot guard: fire `onTerminal` exactly once per (turnId) lifecycle.
	const terminalFiredFor = useRef<string | null>(null)

	// Read historical events through a ref so the bulk-apply effect re-runs
	// only when `turnId` changes — not on every parent render that produces a
	// fresh `historicalEvents` array identity. Without this, live tokens are
	// wiped mid-stream every time the surrounding query result identity flips.
	const historicalEventsRef = useRef(historicalEvents)
	historicalEventsRef.current = historicalEvents

	useEffect(() => {
		dispatch({ type: 'reset' })
		terminalFiredFor.current = null
		const envelopes = historicalEventsRef.current.map((e) => e.envelope)
		if (envelopes.length > 0) {
			dispatch({ type: 'bulk_apply', events: envelopes })
		}
	}, [turnId])

	useEffect(() => {
		if (!turnId || !live) return undefined
		const close = subscribeToTurnEvents(turnId, {
			onEvent: (envelope) => {
				dispatch({ type: 'apply', envelope })
				onLiveEventRef.current?.()
			},
			onClosed: () => {
				if (terminalFiredFor.current !== turnId) {
					terminalFiredFor.current = turnId
					onTerminalRef.current?.()
				}
			}
		})
		return () => close()
	}, [turnId, live])

	// Cover the case where a terminal envelope arrived live before the SSE
	// `done` event (or when the server closes the stream without firing it).
	useEffect(() => {
		if (!turnId) return
		if (state.rendered.terminal && terminalFiredFor.current !== turnId) {
			terminalFiredFor.current = turnId
			onTerminalRef.current?.()
		}
	}, [turnId, state.rendered.terminal])

	return state.rendered
}
