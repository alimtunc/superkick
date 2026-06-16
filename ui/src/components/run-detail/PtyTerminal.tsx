import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchTerminalHistory, terminalWsUrl } from '@/api'
import { openExternal } from '@/lib/openExternal'
import type { TerminalCapabilities, TerminalStatus } from '@/types'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'

import '@xterm/xterm/css/xterm.css'
import { Terminal } from '@xterm/xterm'

import { TerminalStatusBar } from './TerminalStatusBar'

interface PtyTerminalProps {
	runId: string
	isTerminal: boolean
	wsUrl?: string
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
	const [capabilities, setCapabilities] = useState<TerminalCapabilities | null>(null)

	const setupTerminal = useCallback(() => {
		if (!containerRef.current) return null

		const styles = getComputedStyle(document.documentElement)
		const readToken = (name: string): string => styles.getPropertyValue(name).trim()

		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 12,
			fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
			theme: {
				background: readToken('--color-surface'),
				foreground: readToken('--color-fg-muted'),
				cursor: readToken('--color-fg-muted'),
				selectionBackground: readToken('--color-raised')
			},
			scrollback: 10000,
			convertEol: true
		})

		const fitAddon = new FitAddon()
		terminal.loadAddon(fitAddon)
		terminal.loadAddon(
			new WebLinksAddon((event, uri) => {
				event.preventDefault()
				void openExternal(uri)
			})
		)

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
						const caps: TerminalCapabilities = {
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
				const delay = reconnectDelay.current
				reconnectDelay.current = Math.min(delay * 2, RECONNECT_MAX_MS)
				reconnectTimer.current = setTimeout(() => {
					connectWebSocket(terminal)
				}, delay)
			})

			ws.addEventListener('error', () => {
				ws.close()
			})

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
		<div className="rounded-md border border-border bg-surface">
			<TerminalStatusBar status={status} capabilities={capabilities} />
			<div ref={containerRef} className="min-h-80 p-1" />
		</div>
	)
}
