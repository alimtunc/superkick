// Maps a file path to a highlight.js / lowlight language id for the diff viewer.
// The backend diff payload carries no language hint, so it is derived here from
// the extension (or the bare filename for extensionless well-knowns).

const EXT_TO_LANG: Record<string, string> = {
	ts: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	tsx: 'tsx',
	js: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	jsx: 'jsx',
	rs: 'rust',
	py: 'python',
	rb: 'ruby',
	go: 'go',
	java: 'java',
	c: 'c',
	h: 'c',
	cpp: 'cpp',
	cc: 'cpp',
	hpp: 'cpp',
	cs: 'csharp',
	php: 'php',
	swift: 'swift',
	kt: 'kotlin',
	scala: 'scala',
	sh: 'bash',
	bash: 'bash',
	zsh: 'bash',
	json: 'json',
	jsonc: 'json',
	yaml: 'yaml',
	yml: 'yaml',
	toml: 'ini',
	ini: 'ini',
	md: 'markdown',
	mdx: 'markdown',
	css: 'css',
	scss: 'scss',
	less: 'less',
	html: 'xml',
	xml: 'xml',
	svg: 'xml',
	vue: 'xml',
	sql: 'sql',
	graphql: 'graphql',
	gql: 'graphql'
}

const FILENAME_TO_LANG: Record<string, string> = {
	dockerfile: 'dockerfile',
	makefile: 'makefile',
	'.gitignore': 'plaintext',
	'cargo.lock': 'ini'
}

export function langFromPath(path: string): string {
	const base = (path.split('/').pop() ?? path).toLowerCase()
	const byName = FILENAME_TO_LANG[base]
	if (byName) return byName
	const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : ''
	return EXT_TO_LANG[ext] ?? 'plaintext'
}
