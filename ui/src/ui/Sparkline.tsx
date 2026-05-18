import { cn } from '@/lib/utils'
import type { SKTone } from '@/types/icons'

interface SparklineProps {
	data: number[]
	tone?: SKTone
	width?: number
	height?: number
	strokeWidth?: number
	className?: string
}

const TONE_STROKE: Record<SKTone, string> = {
	neutral: 'var(--color-fg-muted)',
	accent: 'var(--color-accent)',
	success: 'var(--color-success)',
	warn: 'var(--color-warn)',
	danger: 'var(--color-danger)',
	info: 'var(--color-info)'
}

function buildPoints(data: number[], width: number, height: number): string {
	const pad = 1
	const innerW = Math.max(1, width - pad * 2)
	const innerH = Math.max(1, height - pad * 2)
	if (data.length < 2) {
		const y = pad + innerH / 2
		return `${pad},${y} ${pad + innerW},${y}`
	}
	const min = Math.min(...data)
	const max = Math.max(...data)
	if (min === max) {
		const y = pad + innerH / 2
		return `${pad},${y} ${pad + innerW},${y}`
	}
	const stepX = innerW / (data.length - 1)
	return data
		.map((value, index) => {
			const x = pad + index * stepX
			const y = pad + innerH - ((value - min) / (max - min)) * innerH
			return `${x.toFixed(2)},${y.toFixed(2)}`
		})
		.join(' ')
}

export function Sparkline({
	data,
	tone = 'neutral',
	width = 48,
	height = 16,
	strokeWidth = 1.25,
	className
}: SparklineProps) {
	const points = buildPoints(data, width, height)
	return (
		<svg
			viewBox={`0 0 ${width} ${height}`}
			width={width}
			height={height}
			className={cn('block', className)}
			aria-hidden="true"
		>
			<polyline
				points={points}
				fill="none"
				stroke={TONE_STROKE[tone]}
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	)
}
