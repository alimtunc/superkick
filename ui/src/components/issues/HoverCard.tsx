import { type ReactNode, useEffect, useRef, useState } from 'react'

const OPEN_DELAY = 400
const CLOSE_DELAY = 150

export function HoverCard({ content, children }: { content: ReactNode; children: ReactNode }) {
	const [open, setOpen] = useState(false)
	const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		return () => {
			if (openTimer.current) clearTimeout(openTimer.current)
			if (closeTimer.current) clearTimeout(closeTimer.current)
		}
	}, [])

	function handleEnter() {
		if (closeTimer.current) {
			clearTimeout(closeTimer.current)
			closeTimer.current = null
		}
		if (openTimer.current) clearTimeout(openTimer.current)
		openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY)
	}

	function handleLeave() {
		if (openTimer.current) {
			clearTimeout(openTimer.current)
			openTimer.current = null
		}
		closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY)
	}

	return (
		<div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
			{children}
			{open ? (
				<div className="pointer-events-none absolute top-full right-0 z-50 pt-1">{content}</div>
			) : null}
		</div>
	)
}
