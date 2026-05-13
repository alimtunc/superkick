export type ShellNavId = 'inbox' | 'issues' | 'tasks' | 'runs' | 'agents' | 'settings' | null

export interface ShellTitle {
	active: ShellNavId
	title: string
	crumbs?: string[]
}
