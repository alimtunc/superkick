import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchTerminalHistory, terminalWsUrl } from '@/api'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'

import '@xterm/xterm/css/xterm.css'
import { Terminal } from '@xterm/xterm'

import { TerminalStatusBar } from './TerminalStatusBar'
import type { Capabilities, TerminalStatus } from './TerminalStatusBar'

/**
 * Live PTY surface. Two callers:
 * - The run-primary terminal (no `wsUrl` prop → derives from `runId`, uses
 *   `terminal-history` for the cleaned-up case).
 * - SUP-101 takeover PTYs (`wsUrl` provided directly, no historyUrl —
 *   takeovers do not persist a transcript).
 */
interface PtyTerminalProps {
	runId: string
	isTerminal: boolean
	/**
	 * Optional explicit WebSocket URL. When omitted, the component derives
	 * the URL from `runId` (legacy primary PTY behaviour). Passed by
	 * `TerminalTakeover` for the SUP-101 takeover PTY.
	 */
	wsUrl?: string
	/**
	 * Whether to load durable history when `isTerminal` is true. Defaults to
	 * `true`. Set to `false` for takeover PTYs since SUP-101 explicitly does
	 * not persist a transcript.
	 */
	loadHistoryOnTerminal?: boolean
}

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 10000

interface CapabilitiesEnvelope {
	type: 'capabilities'
	writable: boolean
	reason: string
}

function parseCapabilitiesEnvelope(raw: string): CapabilitiesEnvelope | null {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return null
	}
	if (
		typeof parsed !== 'object' ||
		parsed === null ||
		(parsed as { type?: unknown }).type !== 'capabilities' ||
		typeof (parsed as { writable?: unknown }).writable !== 'boolean'
	) {
		return null
	}
	const obj = parsed as { writable: boolean; reason?: unknown }
	return {
		type: 'capabilities',
		writable: obj.writable,
		reason: typeof obj.reason === 'string' ? obj.reason : ''
	}
}

export function PtyTerminal({ runId, isTerminal, wsUrl, loadHistoryOnTerminal = true }: PtyTerminalProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const termRef = useRef<Terminal | null>(null)
	const wsRef = useRef<WebSocket | null>(null)
	const fitRef = useRef<FitAddon | null>(null)
	const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const reconnectDelay = useRef(RECONNECT_BASE_MS)
	const writableRef = useRef(false)
	const mountedRef = useRef(true)

	const [status, setStatus] = useState<TerminalStatus>('connecting')
	const [capabilities, setCapabilities] = useState<Capabilities | null>(null)

	const setupTerminal = useCallback(() => {
		if (!containerRef.current) return null

		const styles = getComputedStyle(document.documentElement)
		const readToken = (name: string, fallback: string): string => {
			const value = styles.getPropertyValue(name).trim()
			return value || fallback
		}

		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 12,
			fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
			theme: {
				background: readToken('--color-carbon', '#111214'),
				foreground: readToken('--color-silver', '#b0ada6'),
				cursor: readToken('--color-silver', '#b0ada6'),
				selectionBackground: readToken('--color-slate-deep', '#1f2228')
			},
			scrollback: 10000,
			convertEol: true
		})

		const fitAddon = new FitAddon()
		terminal.loadAddon(fitAddon)
		terminal.loadAddon(new WebLinksAddon())

		terminal.open(containerRef.current)
		fitAddon.fit()

		termRef.current = terminal
		fitRef.current = fitAddon

		return terminal
	}, [])

	const connectWebSocket = useCallback(
		(terminal: Terminal) => {
			if (!mountedRef.current) return

			const url = wsUrl ?? terminalWsUrl(runId)
			const ws = new WebSocket(url)
			ws.binaryType = 'arraybuffer'
			wsRef.current = ws

			setStatus('connecting')

			ws.addEventListener('open', () => {
				reconnectDelay.current = RECONNECT_BASE_MS
			})

			ws.addEventListener('message', (event: MessageEvent) => {
				if (event.data instanceof ArrayBuffer) {
					terminal.write(new Uint8Array(event.data))
				} else if (typeof event.data === 'string') {
					const envelope = parseCapabilitiesEnvelope(event.data)
					if (envelope) {
						const caps: Capabilities = {
							writable: envelope.writable,
							reason: envelope.reason
						}
						writableRef.current = caps.writable
						setCapabilities(caps)
						setStatus(caps.writable ? 'live' : 'readonly')
					}
				}
			})

			ws.addEventListener('close', (event: CloseEvent) => {
				if (event.code === 4001) {
					setStatus('ended')
					return
				}
				if (!mountedRef.current) return
				// Attempt reconnect with exponential backoff.
				const delay = reconnectDelay.current
				reconnectDelay.current = Math.min(delay * 2, RECONNECT_MAX_MS)
				reconnectTimer.current = setTimeout(() => {
					connectWebSocket(terminal)
				}, delay)
			})

			ws.addEventListener('error', () => {
				ws.close()
			})

			// Send terminal input to PTY via ref (no state dependency).
			terminal.onData((data: string) => {
				if (ws.readyState === WebSocket.OPEN && writableRef.current) {
					const encoded = new TextEncoder().encode(data)
					ws.send(encoded)
				}
			})
		},
		[runId, wsUrl]
	)

	const loadHistory = useCallback(
		async (terminal: Terminal) => {
			try {
				const buffer = await fetchTerminalHistory(runId)
				if (buffer.byteLength > 0) {
					terminal.write(new Uint8Array(buffer))
				} else {
					terminal.write('\r\n  No terminal history available.\r\n')
				}
				setStatus('history')
			} catch {
				terminal.write('\r\n  Failed to load terminal history.\r\n')
				setStatus('history')
			}
		},
		[runId]
	)

	useEffect(() => {
		mountedRef.current = true
		const terminal = setupTerminal()
		if (!terminal) return

		if (isTerminal && loadHistoryOnTerminal) {
			loadHistory(terminal)
		} else {
			connectWebSocket(terminal)
		}

		// Resize observer.
		const resizeObserver = new ResizeObserver(() => {
			fitRef.current?.fit()
			if (wsRef.current?.readyState === WebSocket.OPEN && fitRef.current) {
				const dims = fitRef.current.proposeDimensions()
				if (dims) {
					wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
				}
			}
		})

		if (containerRef.current) {
			resizeObserver.observe(containerRef.current)
		}

		return () => {
			mountedRef.current = false
			resizeObserver.disconnect()
			if (reconnectTimer.current) {
				clearTimeout(reconnectTimer.current)
			}
			wsRef.current?.close()
			terminal.dispose()
			termRef.current = null
			wsRef.current = null
			fitRef.current = null
		}
	}, [runId, isTerminal, loadHistoryOnTerminal, setupTerminal, connectWebSocket, loadHistory])

	return (
		<div className="rounded-md border border-edge bg-carbon">
			<TerminalStatusBar status={status} capabilities={capabilities} />
			<div ref={containerRef} className="min-h-80 px-1 py-1" />
		</div>
	)
}
