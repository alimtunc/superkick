import type { Run } from '@/types'

export function fmtDuration(ms: number): string {
	const sec = Math.round(ms / 1000)
	if (sec < 60) return `${sec}s`
	const min = Math.floor(sec / 60)
	if (min < 60) return `${min}m ${sec % 60}s`
	const h = Math.floor(min / 60)
	return `${h}h ${min % 60}m`
}

export function avgDuration(runs: Run[]): string {
	const finished = runs.filter((r) => r.finished_at)
	if (finished.length === 0) return '--'
	const avg =
		finished.reduce(
			(s, r) => s + (new Date(r.finished_at!).getTime() - new Date(r.started_at).getTime()),
			0
		) / finished.length
	return fmtDuration(avg)
}

export function medianDuration(runs: Run[]): string {
	const ds = runs
		.filter((r) => r.finished_at)
		.map((r) => new Date(r.finished_at!).getTime() - new Date(r.started_at).getTime())
		.toSorted((a, b) => a - b)
	if (ds.length === 0) return '--'
	const mid = Math.floor(ds.length / 2)
	const ms = ds.length % 2 === 0 ? (ds[mid - 1] + ds[mid]) / 2 : ds[mid]
	return fmtDuration(ms)
}

export function elapsedMs(startedAt: string, refTime: number): number {
	return refTime - new Date(startedAt).getTime()
}

export function fmtElapsed(startedAt: string, refTime: number): string {
	const ms = elapsedMs(startedAt, refTime)
	const min = Math.floor(ms / 60_000)
	if (min < 1) return '<1m'
	if (min < 60) return `${min}m`
	const h = Math.floor(min / 60)
	return `${h}h ${min % 60}m`
}

/**
 * Compact second-precision duration for inline annotations (SUP-73 stalled
 * badge). Sub-minute as `Ns`, sub-hour as `Nm`, otherwise `NhMm` (omitting
 * the `Mm` part when zero).
 */
export function fmtSecondsCompact(seconds: number): string {
	if (seconds < 60) return `${seconds}s`
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	return minutes === 0 ? `${hours}h` : `${hours}h${minutes}m`
}

export function fmtRelativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime()
	const sec = Math.floor(diff / 1000)
	if (sec < 60) return 'just now'
	const min = Math.floor(sec / 60)
	if (min < 60) return `${min}m ago`
	const h = Math.floor(min / 60)
	if (h < 24) return `${h}h ago`
	const d = Math.floor(h / 24)
	if (d < 30) return `${d}d ago`
	return new Date(iso).toLocaleDateString()
}
