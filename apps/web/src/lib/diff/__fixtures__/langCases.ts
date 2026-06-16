export interface LangCase {
	path: string
	lang: string
}

export const langCases: LangCase[] = [
	{ path: 'crates/core/src/lib.rs', lang: 'rust' },
	{ path: 'ui/src/main.tsx', lang: 'tsx' },
	{ path: 'ui/src/lib/diff/lang.ts', lang: 'typescript' },
	{ path: 'scripts/release.py', lang: 'python' },
	{ path: 'deploy/values.yaml', lang: 'yaml' },
	{ path: 'Cargo.toml', lang: 'ini' },
	{ path: 'Cargo.lock', lang: 'ini' },
	{ path: 'README.md', lang: 'markdown' },
	{ path: 'styles/theme.scss', lang: 'scss' },
	{ path: 'query.graphql', lang: 'graphql' },
	{ path: 'Dockerfile', lang: 'dockerfile' },
	{ path: 'notes.unknownext', lang: 'plaintext' }
]
