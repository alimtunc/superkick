import type { CSSProperties } from 'react'

/**
 * Inline style for the dynamic-colour Linear status badge: the foreground is
 * the status hex and the background is the same hex tinted to ~8% opacity.
 * Linear's status colour is data-driven (per-workspace), so it cannot live in
 * Tailwind theme tokens — colocating the formula here keeps the convention
 * in one place instead of repeated `${color}15` string concatenations.
 */
export function issueStatusBadgeStyle(color: string): CSSProperties {
	return {
		color,
		backgroundColor: `${color}15`
	}
}
