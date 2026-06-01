export function fmtDuration(ms: number): string {
	const sec = Math.round(ms / 1000)
	if (sec < 60) return `${sec}s`
	const min = Math.floor(sec / 60)
	if (min < 60) return `${min}m ${sec % 60}s`
	const h = Math.floor(min / 60)
	return `${h}h ${min % 60}m`
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

export function fmtSecondsCompact(seconds: number): string {
	if (seconds < 60) return `${seconds}s`
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	return minutes === 0 ? `${hours}h` : `${hours}h${minutes}m`
}

export function fmtSecondsVerbose(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}s`
	if (seconds < 3600) {
		const m = Math.floor(seconds / 60)
		const s = Math.round(seconds % 60)
		return s === 0 ? `${m}m` : `${m}m ${s}s`
	}
	if (seconds < 86_400) {
		const h = Math.floor(seconds / 3600)
		const m = Math.floor((seconds % 3600) / 60)
		return m === 0 ? `${h}h` : `${h}h ${m}m`
	}
	const d = Math.floor(seconds / 86_400)
	const h = Math.floor((seconds % 86_400) / 3600)
	return h === 0 ? `${d}d` : `${d}d ${h}h`
}

function toEpochMs(value: number | string | Date): number {
	if (value instanceof Date) return value.getTime()
	if (typeof value === 'number') return value
	return new Date(value).getTime()
}

export function fmtRelativeTime(value: number | string | Date, refTime: number = Date.now()): string {
	const ts = toEpochMs(value)
	const diff = refTime - ts
	const sec = Math.floor(diff / 1000)
	if (sec < 60) return 'just now'
	const min = Math.floor(sec / 60)
	if (min < 60) return `${min}m ago`
	const h = Math.floor(min / 60)
	if (h < 24) return `${h}h ago`
	const d = Math.floor(h / 24)
	if (d < 30) return `${d}d ago`
	return new Date(ts).toLocaleDateString()
}

export function fmtRelativeShort(value: number | string | Date, refTime: number = Date.now()): string {
	const ts = toEpochMs(value)
	if (Number.isNaN(ts)) return ''
	const diff = Math.max(0, refTime - ts)
	const sec = Math.floor(diff / 1000)
	if (sec < 60) return `${sec}s`
	const min = Math.floor(sec / 60)
	if (min < 60) return `${min}m`
	const hr = Math.floor(min / 60)
	if (hr < 24) return `${hr}h`
	const day = Math.floor(hr / 24)
	if (day < 7) return `${day}d`
	const weeks = Math.floor(day / 7)
	if (weeks < 12) return `${weeks}w`
	const months = Math.floor(day / 30)
	if (months < 12) return `${months}mo`
	const years = Math.floor(day / 365)
	return `${years}y`
}
