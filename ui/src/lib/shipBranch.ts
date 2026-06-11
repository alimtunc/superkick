const FORBIDDEN_CHAR = /[~^:?*[\\]/

function hasControlChar(name: string): boolean {
	for (const char of name) {
		const code = char.codePointAt(0) ?? 0
		if (code < 0x20 || code === 0x7f) return true
	}
	return false
}

// Pre-flight only — the backend re-validates with real `git check-ref-format --branch`.
export function validateHeadBranch(name: string): string | null {
	if (name.length === 0) return 'Head branch is required'
	if (name === '@') return 'Branch name cannot be "@"'
	if (hasControlChar(name)) return 'Branch names cannot contain control characters'
	if (/\s/.test(name)) return 'Branch names cannot contain spaces'
	const forbidden = name.match(FORBIDDEN_CHAR)
	if (forbidden) return `Branch names cannot contain "${forbidden[0]}"`
	if (name.includes('..')) return 'Branch names cannot contain ".."'
	if (name.includes('@{')) return 'Branch names cannot contain "@{"'
	if (name.includes('//')) return 'Branch names cannot contain "//"'
	if (name.startsWith('-')) return 'Branch names cannot start with "-"'
	if (name.startsWith('/') || name.endsWith('/')) return 'Branch names cannot start or end with "/"'
	if (name.endsWith('.lock')) return 'Branch names cannot end with ".lock"'
	if (name.startsWith('.') || name.endsWith('.')) return 'Branch names cannot start or end with "."'
	for (const segment of name.split('/')) {
		if (segment.startsWith('.')) return 'Branch name segments cannot start with "."'
		if (segment.endsWith('.lock')) return 'Branch name segments cannot end with ".lock"'
	}
	return null
}
