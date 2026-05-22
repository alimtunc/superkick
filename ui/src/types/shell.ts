export type ShellNavId = 'inbox' | 'issues' | 'agents' | 'settings' | null

export interface ShellTitle {
	active: ShellNavId
	title: string
	crumbs?: string[]
}
