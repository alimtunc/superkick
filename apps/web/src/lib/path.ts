export function splitPath(path: string): { dir: string; name: string } {
	const idx = path.lastIndexOf('/')
	if (idx === -1) return { dir: '', name: path }
	return { dir: path.slice(0, idx + 1), name: path.slice(idx + 1) }
}

export function middleTruncate(value: string, max: number): string {
	if (max <= 0) return ''
	if (value.length <= max) return value
	if (max < 3) return '…'.repeat(max)
	const keep = max - 1
	const head = Math.ceil(keep / 2)
	const tail = keep - head
	return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}
